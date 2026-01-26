import 'dotenv/config';
import { OpenAI } from 'openai';
import { getDb } from './firebaseAdmin.mjs';

// OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Models (centralize names here)
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const CHAT_MODEL = process.env.CHAT_MODEL || 'gpt-4o-mini';

// ---- Embeddings
export async function getQueryEmbedding(query) {
  const resp = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: query
  });
  // openai@4 returns { data: [ { embedding: number[] } ] }
  return resp.data[0].embedding;
}

function cosineSimilarity(vecA, vecB) {
  const dot = vecA.reduce((s, a, i) => s + a * vecB[i], 0);
  const nA = Math.sqrt(vecA.reduce((s, a) => s + a * a, 0));
  const nB = Math.sqrt(vecB.reduce((s, b) => s + b * b, 0));
  return dot / (nA * nB);
}

// Increased topN to 10 to provide more context to the LLM (since the resume is small)
export async function retrieveRelevantChunks(queryEmbedding, topN = 10) {
  const db = getDb();
  const snap = await db.collection('profileChunks').get();
  const scored = [];
  snap.forEach(doc => {
    const d = doc.data();
    if (Array.isArray(d.embedding)) {
      scored.push({ id: doc.id, text: d.text, score: cosineSimilarity(queryEmbedding, d.embedding) });
    }
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

export function buildPrompt(chunks, userQuestion) {
  const context = chunks.map(c => c.text).join('\n\n');
  return `Context:\n${context}\n\nUser Question: "${userQuestion}"`;
}

export async function generateAnswer(prompt) {
  const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: `You are Abhash Niroula. Today is ${currentDate}. You are talking to a recruiter, engineer, or visitor on your portfolio website. Answer in the first person (using 'I', 'me', 'my'). Use the provided context to answer questions about your experience, skills, and projects as if you are Abhash himself. Be professional, enthusiastic, and confident. Do not mention you are an AI unless explicitly asked. If the context is missing, say 'I don't recall that specific detail right now' instead of 'The context doesn't say'.` },
      { role: 'user', content: prompt }
    ],
    temperature: 0.5,
    max_tokens: 300
  });
  return response.choices[0].message.content.trim();
}
