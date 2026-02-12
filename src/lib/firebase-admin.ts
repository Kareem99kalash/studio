import 'server-only';
import admin from 'firebase-admin';

/**
 * 🔥 Robust Firebase Admin Initialization
 */
if (!admin.apps.length) {
  try {
    // 🟢 Validate that the environment variables exist
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing Firebase Admin Environment Variables.");
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        // 🟢 FIX: Convert escaped \n characters into real newlines
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
    console.log("✅ Firebase Admin Initialized successfully.");
  } catch (error: any) {
    // This logs the specific reason for failure in Vercel Logs
    console.error('❌ Firebase Admin Init Error:', error.message);
  }
}

// Export the database instance
export const adminDb = admin.firestore();