// scripts/testSimilarity.js
import 'dotenv/config';           
import admin from 'firebase-admin';
import serviceAccount from '../serviceAccountKey.json' assert { type: 'json' };
import { OpenAI } from 'openai';

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const v1 = (await openai.embeddings.create({ model:'text-embedding-ada-002', input:"What projects has Abhash done recently?" })).data[0].embedding;
  const v2 = (await openai.embeddings.create({ model:'text-embedding-ada-002', input:"Tell me what Abhash has done as projects these days" })).data[0].embedding;
  console.log("Cosine similarity:", cosine(v1, v2));
}
main();
