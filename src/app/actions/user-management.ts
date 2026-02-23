'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';
import { verifyAdminPrivileges } from '@/lib/server-auth';

interface CreateUserPayload {
  username: string;
  password: string;
  role: string;
  permissions?: any;
  groupId?: string | null;
}

interface UpdateUserPayload {
    role?: string;
    groupId?: string | null;
    permissions?: any;
    password?: string;
}

export async function createSystemUser(data: CreateUserPayload, adminId: string) {
  // Ensure caller is admin
  await verifyAdminPrivileges(adminId);

  const { username, password, role, permissions = {}, groupId = null } = data;
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
        email: `${cleanUsername}@geocoverage.local`, // 🟢 ADDED EMAIL for Auth compatibility
        emailVerified: true
      });
    } catch (authError: any) {
      // Ignore if UID exists (means auth is done, just missing Firestore profile)
      if (authError.code !== 'auth/uid-already-exists') {
        throw authError;
      } else {
         // If user exists, ensure they have the email
         try {
             await adminAuth.updateUser(cleanUsername, {
                 email: `${cleanUsername}@geocoverage.local`,
                 password: password
             });
         } catch (updateError) {
             // Ignore email update error if it matches
         }
      }
    }

    // 3. Create Firestore Profile
    await adminDb.collection('users').doc(cleanUsername).set({
      username: username,
      role: role,
      password: password, // Stored for legacy/display support
      permissions: permissions,
      groupId: groupId,
      createdAt: new Date().toISOString(),
      createdBy: adminId,
      validRefreshToken: null
    });

    logger.info('UserMgmt', `User created: ${cleanUsername} by ${adminId}`);
    return { success: true, message: `User ${username} created successfully.` };

  } catch (error: any) {
    logger.error('UserMgmt', `Creation failed for ${username}: ${error.message}`);
    return { success: false, message: error.message || 'System error during creation.' };
  }
}

export async function updateSystemUser(username: string, updates: UpdateUserPayload, adminId: string) {
    await verifyAdminPrivileges(adminId);

    const cleanUsername = username.toLowerCase().trim();
    const userRef = adminDb.collection('users').doc(cleanUsername);

    try {
        // 1. Update Auth if Password Changed
        if (updates.password && updates.password.trim() !== '') {
             try {
                 // Check if user exists in Auth
                 let userRecord;
                 try {
                     userRecord = await adminAuth.getUser(cleanUsername);
                 } catch (e: any) {
                     if (e.code === 'auth/user-not-found') {
                         userRecord = null;
                     } else {
                         throw e;
                     }
                 }

                 if (!userRecord) {
                      // User missing in Auth -> Create
                      await adminAuth.createUser({
                          uid: cleanUsername,
                          password: updates.password,
                          email: `${cleanUsername}@geocoverage.local`,
                          emailVerified: true
                      });
                 } else {
                      // User exists -> Update
                      const authUpdates: any = { password: updates.password };
                      if (!userRecord.email) {
                          authUpdates.email = `${cleanUsername}@geocoverage.local`;
                          authUpdates.emailVerified = true;
                      }
                      await adminAuth.updateUser(cleanUsername, authUpdates);
                 }
             } catch (e: any) {
                 logger.error('UserMgmt', `Failed to update Auth password for ${cleanUsername}: ${e.message}`);
                 throw new Error(`Failed to secure account: ${e.message}`);
             }
        }

        // 2. Update Firestore
        // We use object spread to avoid modifying original 'updates'
        const firestoreUpdates: any = { ...updates };
        // Clean up undefined
        Object.keys(firestoreUpdates).forEach(key => firestoreUpdates[key] === undefined && delete firestoreUpdates[key]);

        await userRef.update(firestoreUpdates);

        logger.info('UserMgmt', `User updated: ${cleanUsername} by ${adminId}`);
        return { success: true, message: 'User updated successfully.' };
    } catch (error: any) {
        logger.error('UserMgmt', `Update failed for ${cleanUsername}: ${error.message}`);
        return { success: false, message: error.message || 'Update failed.' };
    }
}

export async function deleteSystemUser(username: string, adminId: string) {
    await verifyAdminPrivileges(adminId);
    const cleanUsername = username.toLowerCase().trim();

    try {
        // 1. Delete from Auth
        try {
            await adminAuth.deleteUser(cleanUsername);
        } catch (e: any) {
            if (e.code !== 'auth/user-not-found') {
                logger.warn('UserMgmt', `Failed to delete Auth user ${cleanUsername}: ${e.message}`);
            }
        }

        // 2. Delete from Firestore
        await adminDb.collection('users').doc(cleanUsername).delete();

        logger.info('UserMgmt', `User deleted: ${cleanUsername} by ${adminId}`);
        return { success: true, message: 'User deleted.' };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}
