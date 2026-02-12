'use server';

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { verifyAdminPrivileges } from '@/lib/server-auth'; // 🟢 Import the Guard
import { logActivity, logger } from '@/lib/logger';

interface CreateUserPayload {
  username: string;
  password: string; // Ideally hash this, but keeping it simple per your stack
  role: 'admin' | 'user' | 'driver';
  permissions?: Record<string, boolean>;
}

export async function createSystemUser(requesterId: string, newUser: CreateUserPayload) {
  
  // 🔒 STEP 1: SERVER-SIDE SECURITY CHECK
  // We pause here. If this fails, the code below NEVER runs.
  await verifyAdminPrivileges(requesterId);

  const cleanUsername = newUser.username.toLowerCase().trim();
  
  try {
    // 2. Check if user already exists
    const newUserRef = doc(db, 'users', cleanUsername);
    const existingCheck = await getDoc(newUserRef);
    
    if (existingCheck.exists()) {
      return { success: false, message: "User already exists." };
    }

    // 3. Create the new User
    const userData = {
      username: cleanUsername,
      password: newUser.password, 
      role: newUser.role,
      permissions: newUser.permissions || {},
      createdAt: new Date().toISOString(),
      createdBy: requesterId
    };

    await setDoc(newUserRef, userData);

    // 4. Audit Log
    await logActivity(requesterId, 'User Management', `Created new ${newUser.role}: ${cleanUsername}`);
    
    return { success: true, message: `Successfully created ${newUser.role} user: ${cleanUsername}` };

  } catch (error) {
    logger.error("UserCreate", "Database Write Failed", error);
    return { success: false, message: "Internal System Error" };
  }
}