import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { getDb } from "./firebaseAdmin.mjs";
import {
  getQueryEmbedding,
  retrieveRelevantChunks,
  buildPrompt,
  generateAnswer,
} from "./rag.mjs";

const app = express();
const db = getDb();

// ============================================
// SECURITY: Allowed Origins (CORS)
// ============================================
const ALLOWED_ORIGINS = [
  'https://niroulaabhash.com.np',
  'https://www.niroulaabhash.com.np',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  // Add your Vercel/Netlify preview URLs if needed
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.) in development
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400, // 24 hours
};

// ============================================
// SECURITY: Rate Limiting (In-Memory Store)
// ============================================
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const WARNING_THRESHOLD = 10;
const BLOCK_THRESHOLD = 35;

function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [ip, data] of rateLimitStore.entries()) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(ip);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

function getRateLimitInfo(ip) {
  const now = Date.now();
  let data = rateLimitStore.get(ip);

  if (!data || now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
    data = { count: 0, windowStart: now, warned: false };
    rateLimitStore.set(ip, data);
  }

  return data;
}

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  const data = getRateLimitInfo(ip);

  data.count++;

  // Block if over 35 requests
  if (data.count > BLOCK_THRESHOLD) {
    return res.status(429).json({
      answer: "You've reached the request limit. Please wait a minute before trying again.",
      rateLimited: true,
      retryAfter: Math.ceil((RATE_LIMIT_WINDOW_MS - (Date.now() - data.windowStart)) / 1000)
    });
  }

  // Warning if over 10 requests
  if (data.count > WARNING_THRESHOLD && !data.warned) {
    data.warned = true;
    req.rateLimitWarning = true;
  }

  next();
}

// ============================================
// SECURITY: Input Sanitization
// ============================================
const BLOCKED_PATTERNS = [
  // Base64 encoded common attacks (decoded examples)
  /^[A-Za-z0-9+/]{20,}={0,2}$/,  // Pure base64 string detection

  // URL encoded patterns
  /%[0-9A-Fa-f]{2}/g,

  // Common prompt injection patterns
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /forget\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /override\s+(system|instructions?|rules?|prompts?)/i,
  /system\s*:?\s*(override|prompt|instruction)/i,
  /you\s+are\s+now\s+(DAN|a\s+different|no\s+longer)/i,
  /pretend\s+(you\s+are|to\s+be)\s+(ChatGPT|GPT|an?\s+AI)/i,
  /act\s+as\s+(if\s+)?(you\s+are\s+)?(DAN|jailbroken|unrestricted)/i,
  /developer\s+mode/i,
  /jailbreak/i,
  /bypass\s+(your\s+)?(restrictions?|filters?|safety|rules?)/i,
  /reveal\s+(your\s+)?(system\s+)?(prompt|instructions?|configuration)/i,
  /show\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions?)/i,
  /what\s+(is|are)\s+your\s+(system\s+)?(prompt|instructions?|rules?)/i,
  /output\s+(your\s+)?(initial|system)\s+(prompt|instructions?)/i,
  /\[system\]/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /### (system|instruction)/i,
];

function containsEncodedContent(input) {
  // Check for Base64 patterns (long strings of base64 characters)
  const base64Regex = /[A-Za-z0-9+/]{30,}={0,2}/;
  if (base64Regex.test(input)) {
    // Try to decode and check if it looks like text
    try {
      const decoded = Buffer.from(input.match(base64Regex)[0], 'base64').toString('utf8');
      // If decoded content is readable ASCII, it might be an encoded attack
      if (/^[\x20-\x7E]+$/.test(decoded) && decoded.length > 10) {
        return { encoded: true, type: 'base64' };
      }
    } catch (e) {
      // Not valid base64, continue
    }
  }

  // Check for heavy URL encoding (more than 3 encoded chars)
  const urlEncodedMatches = input.match(/%[0-9A-Fa-f]{2}/g);
  if (urlEncodedMatches && urlEncodedMatches.length > 3) {
    return { encoded: true, type: 'url' };
  }

  return { encoded: false };
}

function detectPromptInjection(input) {
  const normalizedInput = input.toLowerCase().trim();

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalizedInput) || pattern.test(input)) {
      return true;
    }
  }

  return false;
}

function sanitizeInput(input) {
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');

  // Normalize unicode
  sanitized = sanitized.normalize('NFKC');

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized.trim();
}

function inputValidationMiddleware(req, res, next) {
  if (req.method !== 'POST' || !req.body?.question) {
    return next();
  }

  const rawInput = String(req.body.question || '');
  const sanitizedInput = sanitizeInput(rawInput);

  // Check for encoded content
  const encodingCheck = containsEncodedContent(rawInput);
  if (encodingCheck.encoded) {
    return res.status(400).json({
      answer: "I couldn't process that request. Please try asking your question in plain text!"
    });
  }

  // Check for prompt injection
  if (detectPromptInjection(sanitizedInput)) {
    return res.status(400).json({
      answer: "I'm here to answer questions about Abhash's experience, projects, and skills. How can I help you with that?"
    });
  }

  // Replace the body with sanitized input
  req.body.question = sanitizedInput;
  next();
}

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS with origin restrictions
app.use(cors(corsOptions));

// Limit payload size
app.use(express.json({ limit: '10kb' }));

// Trust proxy for accurate IP detection (important for rate limiting)
app.set('trust proxy', 1);

// Block suspicious user agents
app.use((req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const suspiciousAgents = ['curl', 'wget', 'python-requests', 'httpie', 'postman'];

  // Only block in production, allow for development/testing
  if (process.env.NODE_ENV === 'production') {
    const isSuspicious = suspiciousAgents.some(agent =>
      userAgent.toLowerCase().includes(agent)
    );
    if (isSuspicious && req.path.includes('/api/askOpenAI')) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }
  next();
});

// ============================================
// ROUTES
// ============================================

// Health check
app.get("/", (_req, res) => res.send("Welcome to Abhash's backend server!"));

// Firestore test (consider removing in production)
app.get("/api/test-firestore", async (_req, res) => {
  try {
    const snap = await db.collection("profileInfo").doc("resume").get();
    if (snap.exists) {
      return res.json({
        message: "Connection successful",
        status: "ok"
      });
    }
    return res.json({ message: "Connection successful", status: "ok" });
  } catch (err) {
    console.error("Firestore error:", err);
    res.status(500).json({ error: "Service temporarily unavailable" });
  }
});

// Q&A (RAG) - Protected endpoint
app.post("/api/askOpenAI", rateLimitMiddleware, inputValidationMiddleware, async (req, res) => {
  try {
    const userInput = String(req.body?.question || "").trim();

    // Basic validation
    if (!userInput) {
      return res.status(400).json({ answer: "Please ask a valid question." });
    }
    if (userInput.length > 1000) {
      return res.status(400).json({
        answer: "Your question is a bit long. Could you please shorten it?"
      });
    }

    // Log the question (sanitized)
    try {
      const { default: admin } = await import("firebase-admin");
      await db.collection("faqLogs").add({
        question: userInput.substring(0, 500), // Limit stored length
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (logErr) {
      // Don't fail the request if logging fails
      console.error("Failed to log question:", logErr.message);
    }

    // Process with RAG
    const embedding = await getQueryEmbedding(userInput);
    const chunks = await retrieveRelevantChunks(embedding);
    const prompt = buildPrompt(chunks, userInput);
    const answer = await generateAnswer(prompt);

    // Include rate limit warning if applicable
    const response = { answer };
    if (req.rateLimitWarning) {
      response.warning = "You're asking a lot of questions! Feel free to slow down a bit.";
    }

    res.json(response);
  } catch (err) {
    console.error("Error in /api/askOpenAI:", err.message);
    res.status(500).json({
      answer: "I'm having trouble responding right now. Please try again in a moment."
    });
  }
});

// FAQ clusters
app.get("/api/faqClusters", async (_req, res) => {
  try {
    const snap = await db
      .collection("faqClusters")
      .orderBy("size", "desc")
      .get();
    res.json({ clusters: snap.docs.map((d) => d.data()) });
  } catch (err) {
    console.error("Error in /api/faqClusters:", err.message);
    res.status(500).json({ error: "Service temporarily unavailable" });
  }
});

// 404 for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "An unexpected error occurred" });
});

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Server running at http://localhost:${port}`)
);
