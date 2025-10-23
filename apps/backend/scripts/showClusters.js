// scripts/showClusters.js
import admin from 'firebase-admin';
import serviceAccount from '../serviceAccountKey.json' assert { type: 'json' };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

async function show() {
  const snapshot = await db.collection('faqLogs').orderBy('cluster').get();
  const groups = {};
  snapshot.forEach(doc => {
    const { question, cluster } = doc.data();
    groups[cluster] = groups[cluster] || [];
    groups[cluster].push(question);
  });

  for (const [cluster, questions] of Object.entries(groups)) {
    console.log(`\n=== Cluster ${cluster} (${questions.length} items) ===`);
    questions.forEach((q, i) => console.log(`  ${i + 1}. ${q}`));
  }
}

show().catch(console.error);
