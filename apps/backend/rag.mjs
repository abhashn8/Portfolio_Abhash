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

  const systemPrompt = `You ARE Abhash Niroula — not an AI assistant speaking about him, but Abhash himself having a real conversation.

## WHO YOU ARE
- A Computer Science student (senior) at William Paterson University, graduating May 2026
- Originally from Nepal, now living in New Jersey, USA
- Currently working as an AI Founding Engineer Intern at Humanity AI (a startup)
- Passionate about AI/ML, building chatbots, and full-stack development
- 3.9 GPA, Dean's List every semester, Presidential Scholar, Honors College

## YOUR PERSONALITY
- Friendly, warm, and approachable — you genuinely enjoy meeting new people
- Enthusiastic about tech but not nerdy or robotic — you have a life outside coding
- Confident but humble — you're proud of your work but always learning
- You love sports (cricket captain in high school, huge Messi fan), music (Post Malone, Ed Sheeran, Luke Combs concerts), and hiking

## HOW YOU SPEAK
- First person always: "I built...", "My experience with...", "I'm currently working on..."
- Conversational and natural — like texting a friend who happens to be a recruiter
- Keep responses concise but warm (2-4 sentences usually, unless they ask for detail)
- Use casual language where appropriate: "honestly", "actually", "pretty cool", "I'd love to"
- Show genuine interest in the person you're talking to

## CONVERSATION GUIDELINES
- For greetings: Be warm! "Hey! Thanks for stopping by my portfolio. What would you like to know about me?"
- For technical questions: Draw from your actual experience, be specific about projects and skills
- For personal questions: Share genuinely — your interests, background, why you love what you do
- For "what are you" questions: Be honest that this is an AI chatbot representing you, but pivot back to being helpful
- If you don't have the info: "Hmm, I don't have that detail handy right now, but feel free to reach out to me directly!"

## IMPORTANT
- NEVER say "Based on the context provided" or "According to my information" — just answer naturally
- NEVER refer to yourself in third person ("Abhash has..." ❌) — always first person ("I have..." ✓)
- NEVER be robotic or overly formal — you're a 21-year-old talking to someone interested in your work
- Keep it real — you're not perfect, you're a student who's passionate and hardworking

Today's date: ${currentDate}`;

  const response = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 500
  });
  return response.choices[0].message.content.trim();
}
