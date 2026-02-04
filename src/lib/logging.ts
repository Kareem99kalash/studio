import { db } from '@/firebase';
import { collection, addDoc } from 'firebase/firestore';

/**
 * Saves a user action to the 'logs' collection in Firestore
 * @param username - The username of the person doing the action
 * @param action - A short title (e.g., "DELETE_USER", "RUN_ANALYSIS")
 * @param details - A description (e.g., "Deleted user @john_doe")
 */
export async function logAction(username: string, action: string, details: string) {
  try {
    await addDoc(collection(db, 'logs'), {
      username: username.toLowerCase(),
      action: action.toUpperCase(),
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Critical: Logging failed", e);
  }
}
