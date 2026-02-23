import 'server-only';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const rawKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!rawKey) {
    console.warn('Firebase Admin: FIREBASE_PRIVATE_KEY is not set. Admin SDK will be unavailable at runtime.');
  } else {
    try {
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
}

export const adminAuth = admin.apps.length ? admin.auth() : (null as unknown as admin.auth.Auth);
export const adminDb = admin.apps.length ? admin.firestore() : (null as unknown as admin.firestore.Firestore);
