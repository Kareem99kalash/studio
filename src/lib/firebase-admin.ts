import 'server-only';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!rawKey) {
      throw new Error("FIREBASE_PRIVATE_KEY is missing from environment variables.");
    }

    // 🟢 THE FIX: Robustly format the key for the OpenSSL decoder
    // This handles literal newlines, escaped newlines, and double-escaped newlines.
    const formattedKey = rawKey
      .replace(/\\n/g, '\n') // Convert literal "\n" to real newlines
      .replace(/"/g, '');    // Remove any accidental surrounding quotes

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedKey,
      }),
    });
    
    console.log("✅ Firebase Admin successfully initialized.");
  } catch (error: any) {
    console.error('❌ Firebase Admin Init Error:', error.message);
    // This ensures your app doesn't crash silently but tells you why
    throw new Error(`Failed to initialize Firebase Admin: ${error.message}`);
  }
}

export const adminDb = admin.firestore();
