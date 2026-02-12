import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { logger } from '@/lib/logger';

/**
 * 🛡️ SERVER-SIDE GUARD
 * Verifies that the 'requesterId' actually belongs to an Admin in the database.
 * Usage: await verifyAdminPrivileges(currentUsername);
 */
export async function verifyAdminPrivileges(requesterId: string) {
  if (!requesterId) {
    throw new Error("Unauthorized: No identity provided.");
  }

  try {
    // 1. Fetch the user's latest data directly from Firestore
    const userRef = doc(db, 'users', requesterId);
    const userSnap = await getDoc(userRef);

    // 2. Check existence
    if (!userSnap.exists()) {
      logger.warn('Security', `Blocked action from non-existent user: ${requesterId}`);
      throw new Error("Unauthorized: Identity verification failed.");
    }

    const userData = userSnap.data();

    // 3. Check Role
    if (userData.role !== 'admin' && userData.role !== 'super_admin') {
      logger.warn('Security', `Blocked non-admin action by: ${requesterId}`);
      throw new Error("Forbidden: You do not have admin privileges.");
    }

    return true; // Access Granted

  } catch (error) {
    // Log the actual system error internally, but throw a generic message to the client
    if (error instanceof Error && error.message.includes('Forbidden')) {
        throw error; // Re-throw permission errors
    }
    console.error("Auth Check Failed:", error);
    throw new Error("Authorization check failed due to a system error.");
  }
}
