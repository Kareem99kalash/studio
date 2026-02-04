import { db } from '@/firebase'; // Double check this path!
import { collection, addDoc } from 'firebase/firestore';

export async function logAction(username: string, action: string, details: string) {
  if (!username) {
    console.error("Logging failed: No username provided");
    return;
  }

  try {
    console.log(`📡 Attempting to log: ${action} for ${username}`);
    const docRef = await addDoc(collection(db, 'logs'), {
      username: username.toLowerCase(),
      action: action.toUpperCase(),
      details: details,
      timestamp: new Date().toISOString(),
    });
    console.log("✅ Log successfully saved with ID: ", docRef.id);
  } catch (e) {
    console.error("❌ Firestore Logging Error:", e);
  }
}
