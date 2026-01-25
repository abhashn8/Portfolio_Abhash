import "dotenv/config";
import express from "express";
import cors from "cors";
import { getDb } from "./firebaseAdmin.mjs";
import {
  getQueryEmbedding,
  retrieveRelevantChunks,
  buildPrompt,
  generateAnswer,
} from "./rag.mjs";

const app = express();
const db = getDb();

// Core middleware
app.use(express.json());
app.use(cors());

// Health
app.get("/", (_req, res) => res.send("Welcome to Abhash's backend server!"));

// Firestore test
app.get("/api/test-firestore", async (_req, res) => {
  try {
    const snap = await db.collection("profileInfo").doc("resume").get();
    if (snap.exists) {
      return res.json({
        message: "Firestore access is working!",
        data: snap.data(),
      });
    }
    return res.json({ message: "Document does not exist." });
  } catch (err) {
    console.error("Firestore error:", err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

// Q&A (RAG)
app.post("/api/askOpenAI", async (req, res) => {
  try {
    const userInput = String(req.body?.question || "").trim();
    if (!userInput) {
      return res.status(400).json({ answer: "Please ask a valid question." });
    }
    if (userInput.length > 2000) {
      return res
        .status(413)
        .json({ answer: "Question too long. Please shorten it." });
    }

    const { default: admin } = await import("firebase-admin");
    await db.collection("faqLogs").add({
      question: userInput,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    const embedding = await getQueryEmbedding(userInput);
    const chunks = await retrieveRelevantChunks(embedding, 3);
    const prompt = buildPrompt(chunks, userInput);
    const answer = await generateAnswer(prompt);

    res.json({ answer });
  } catch (err) {
    console.error("Error in /api/askOpenAI:", err);
    res
      .status(500)
      .json({ answer: "Something went wrong while processing your request." });
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
    console.error("Error in /api/faqClusters:", err);
    res
      .status(500)
      .json({ error: "Unable to load FAQ clusters at this time." });
  }
});

// 404 for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const port = process.env.PORT || 3000;
app.listen(port, () =>
  console.log(`Server running at http://localhost:${port}`)
);
