'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';

interface CreateUserPayload {
  username: string;
  password: string;
  role: string;
}

export async function createSystemUser(data: CreateUserPayload, adminId: string) {
  const { username, password, role } = data;
  const cleanUsername = username.toLowerCase().trim();

  try {
    // 1. Check if user already exists in Firestore
    const userDoc = await adminDb.collection('users').doc(cleanUsername).get();
    if (userDoc.exists) {
      return { success: false, message: 'User already exists.' };
    }

    // 2. Create Firebase Auth User
    try {
      await adminAuth.createUser({
        uid: cleanUsername,
        displayName: username,
        password: password,
      });
    } catch (authError: any) {
      // Ignore if UID exists (means auth is done, just missing Firestore profile)
      if (authError.code !== 'auth/uid-already-exists') {
        throw authError;
      }
    }

    // 3. Create Firestore Profile
    await adminDb.collection('users').doc(cleanUsername).set({
      username: username,
      role: role,
      password: password, // Stored for legacy/display support
      permissions: {},
      createdAt: new Date().toISOString(),
      createdBy: adminId,
      validRefreshToken: null
    });

    logger.info('UserMgmt', `User created: ${cleanUsername} by ${adminId}`);
    return { success: true, message: `User ${username} created successfully.` };

  } catch (error: any) {
    // 🟢 FIXED: Combined error message into string to prevent argument type errors
    logger.error('UserMgmt', `Creation failed for ${username}: ${error.message}`);
    return { success: false, message: error.message || 'System error during creation.' };
  }
}
