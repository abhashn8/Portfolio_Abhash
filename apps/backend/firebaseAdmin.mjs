// Single source of truth for Firebase Admin initialization
import admin from 'firebase-admin';

let initialized = false;

export function getAdmin() {
  if (!initialized) {
    const raw = process.env.FIREBASE_CONFIG;
    if (!raw) throw new Error('Missing FIREBASE_CONFIG in env.');
    let creds;
    try {
      creds = JSON.parse(raw);
    } catch (e) {
      throw new Error('Invalid JSON in FIREBASE_CONFIG');
    }
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(creds)
      });
    }
    initialized = true;
  }
  return admin;
}

export function getDb() {
  return getAdmin().firestore();
}
