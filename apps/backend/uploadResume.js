import admin from "firebase-admin";
import fs from 'fs';
import path from 'path';

// Load service account (using fs to avoid experimental json import warnings if any)
const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Load resume data from JSON file
const resumeDataPath = path.join(process.cwd(), 'data', 'resumeData.json');
const resumeData = JSON.parse(fs.readFileSync(resumeDataPath, 'utf8'));

db.collection("profileInfo")
  .doc("resume")
  .set(resumeData)
  .then(() => {
    console.log("Resume document successfully written!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error writing document: ", error);
    process.exit(1);
  });
