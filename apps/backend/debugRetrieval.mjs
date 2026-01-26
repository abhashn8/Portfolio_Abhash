import "dotenv/config";
import { getQueryEmbedding, retrieveRelevantChunks } from "./rag.mjs";
import { getDb } from "./firebaseAdmin.mjs";

async function test() {
  const query = "What is your most recent project?";
  console.log(`Query: "${query}"`);

  console.log("Getting embedding...");
  const embedding = await getQueryEmbedding(query);

  console.log("Retrieving chunks (top 3)...");
  const chunks = await retrieveRelevantChunks(embedding, 3); // Testing with current setting

  console.log("\n--- Retrieved Chunks ---");
  chunks.forEach((c, i) => {
    console.log(`\n[${i + 1}] Score: ${c.score.toFixed(4)}`);
    console.log(c.text);
  });
}

test().catch(console.error);
