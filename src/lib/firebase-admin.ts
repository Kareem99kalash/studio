import 'server-only';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!rawKey) throw new Error("FIREBASE_PRIVATE_KEY is missing.");

    const formattedKey = rawKey.replace(/\\n/g, '\n').replace(/"/g, '');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedKey,
      }),
    });
  } catch (error: any) {
    console.error('Firebase Admin Init Error:', error.message);
  }
}

// 🟢 EXPORT BOTH AUTH AND DB
export const adminAuth = admin.auth();
export const adminDb = admin.firestore();
