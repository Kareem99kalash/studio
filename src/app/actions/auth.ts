'use server';

import { cookies } from 'next/headers';
import { encrypt } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { adminDb } from '@/lib/firebase-admin';

export async function loginAction(formData: FormData) {
  const username = (formData.get('username') as string).toLowerCase().trim();
  const password = formData.get('password') as string;

  try {
    // 1. Verify Credentials using ADMIN SDK
    const userRef = adminDb.collection('users').doc(username);
    const userSnap = await userRef.get();

    if (!userSnap.exists || userSnap.data()?.password !== password) {
      return { success: false, message: 'Invalid credentials' };
    }

    const userData = userSnap.data();
    const tokenId = crypto.randomUUID();

    // 2. Create JWT Payloads
    const sessionPayload = {
      uid: username,
      role: userData?.role,
      permissions: userData?.permissions || {},
      jti: tokenId
    };

    // 3. Generate Tokens
    const accessToken = await encrypt({ ...sessionPayload, type: 'access' }, '15m');
    const refreshToken = await encrypt({ ...sessionPayload, type: 'refresh' }, '7d');

    // 4. Store Valid Token ID in DB (Using Admin SDK)
    await userRef.update({ 
      validRefreshToken: tokenId,
      lastLogin: new Date().toISOString()
    });

    // 5. Set Secure Cookies
    const cookieStore = await cookies();
    const isProd = process.env.NODE_ENV === 'production';
    
    // 🟢 Access Token Configuration
    cookieStore.set('session_access', accessToken, {
      httpOnly: true,
      secure: isProd, // Must be true on Vercel
      sameSite: 'lax',
      path: '/', // 🛡️ CRUCIAL: Makes cookie visible to /dashboard
      expires: new Date(Date.now() + 15 * 60 * 1000), 
    });

    // 🟢 Refresh Token Configuration
    cookieStore.set('session_refresh', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/', // 🛡️ CRUCIAL: Makes cookie visible to middleware
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    logger.info('Auth', `User logged in: ${username}`);
    return { success: true };

  } catch (error: any) {
    console.error("LOGIN ERROR:", error); 
    return { 
      success: false, 
      message: `System Error: ${error.message}` 
    };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  // 🟢 Ensure we delete cookies from the root path
  cookieStore.set('session_access', '', { path: '/', maxAge: 0 });
  cookieStore.set('session_refresh', '', { path: '/', maxAge: 0 });
}
