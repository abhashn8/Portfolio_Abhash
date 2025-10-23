// scripts/embedFaqLogs.cjs
require('dotenv').config();
const admin = require('firebase-admin');
const { OpenAI } = require('openai');

// initialize…
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embed(text) {
  const resp = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text
  });
  return Array.isArray(resp.data)
    ? resp.data[0].embedding
    : resp.data.data[0].embedding;
}

async function main() {
  const snaps = await db.collection('faqLogs').get();
  for (const doc of snaps.docs) {
    const data = doc.data();
    if (!data.embedding) {
      const vector = await embed(data.question);
      await doc.ref.update({ embedding: vector });
      console.log(`Embedded ${doc.id}`);
    }
  }
  console.log('All embeddings up to date.');
}

main().catch(console.error);
