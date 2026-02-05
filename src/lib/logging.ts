import { db } from '@/firebase';
import { collection, addDoc } from 'firebase/firestore';

export async function logAction(username: string, action: string, details: string) {
  if (!username) {
    console.warn("Log not saved: No username provided.");
    return;
  }

  try {
    await addDoc(collection(db, 'logs'), {
      username: username.toLowerCase(),
      action: action.toUpperCase(),
      details: details,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Firestore Logging Error:", e);
  }
}
