import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/firebase';

export const logActivity = async (
  username: string | null, 
  action: string, 
  details: string
) => {
  try {
    await addDoc(collection(db, 'audit_logs'), {
      timestamp: new Date().toISOString(),
      user: username || 'Unknown',
      action: action,
      details: details,
      userAgent: window.navigator.userAgent // Optional: Tracks browser/device
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
};