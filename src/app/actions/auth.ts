'use server';

import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { cookies } from 'next/headers';
import { encrypt } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function loginAction(formData: FormData) {
  const username = (formData.get('username') as string).toLowerCase().trim();
  const password = formData.get('password') as string;

  try {
    // 1. Verify Credentials
    const userRef = doc(db, 'users', username);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists() || userSnap.data().password !== password) {
      return { success: false, message: 'Invalid credentials' };
    }

    const userData = userSnap.data();
    const tokenId = crypto.randomUUID();

    // 2. Create JWT Payloads
    const sessionPayload = {
      uid: username,
      role: userData.role,
      permissions: userData.permissions || {},
      jti: tokenId
    };

    // 3. Generate Tokens
    const accessToken = await encrypt({ ...sessionPayload, type: 'access' }, '15m');
    const refreshToken = await encrypt({ ...sessionPayload, type: 'refresh' }, '7d');

    // 4. Store Valid Token ID in DB (For Rotation)
    await updateDoc(userRef, { 
      validRefreshToken: tokenId,
      lastLogin: new Date().toISOString()
    });

    // 5. Set Secure Cookies
    const cookieStore = await cookies();
    
    cookieStore.set('session_access', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    });

    cookieStore.set('session_refresh', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    logger.info('Auth', `User logged in: ${username}`);
    return { success: true };

  } catch (error) {
    logger.error('Auth', 'Login failed', error);
    return { success: false, message: 'System error during login' };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete('session_access');
  cookieStore.delete('session_refresh');
}