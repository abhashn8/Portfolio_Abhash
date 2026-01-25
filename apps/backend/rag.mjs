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

export async function retrieveRelevantChunks(queryEmbedding, topN = 3) {
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
  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: "You are Abhash Niroula (virtual). Use the provided context. Be kind, concise, and helpful." },
      { role: 'user', content: prompt }
    ],
    temperature: 0.5,
    max_tokens: 300
  });
  return response.choices[0].message.content.trim();
}
