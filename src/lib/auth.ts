import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { logger } from '@/lib/logger';

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || 'default-insecure-secret-do-not-use-prod');

const ACCESS_TOKEN_EXP = '15m'; // Short life
const REFRESH_TOKEN_EXP = '7d'; // Long life

export async function encrypt(payload: any, expiresIn: string) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SECRET_KEY);
}

export async function decrypt(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, { algorithms: ['HS256'] });
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * 🔄 REFRESH TOKEN ROTATION
 * 1. Verifies the old refresh token.
 * 2. Checks against DB to ensure it hasn't been revoked/reused.
 * 3. Issues a NEW pair (Access + Refresh).
 * 4. Invalidates the old one.
 */
export async function rotateTokens(oldRefreshToken: string) {
  const payload = await decrypt(oldRefreshToken);
  
  if (!payload || !payload.uid || !payload.jti) {
    throw new Error('Invalid Token');
  }

  const userId = payload.uid as string;
  const tokenId = payload.jti as string;

  // 1. Check DB for this specific token
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) throw new Error('User not found');
  
  const userData = userSnap.data();

  // 🛡️ REUSE DETECTION: If the DB has a DIFFERENT valid token than what was sent,
  // it means the old one was stolen and reused. Lock the account or force logout.
  if (userData.validRefreshToken !== tokenId) {
    logger.error('Auth', `Token Reuse Detected! Possible Breach for user: ${userId}`);
    await updateDoc(userRef, { validRefreshToken: null }); // Revoke access immediately
    throw new Error('Token Reuse Detected');
  }

  // 2. Generate NEW Tokens
  const newJti = crypto.randomUUID();
  const sessionData = { 
    uid: userId, 
    role: userData.role, 
    permissions: userData.permissions,
    jti: newJti // Unique ID for this specific token
  };

  const accessToken = await encrypt({ ...sessionData, type: 'access' }, ACCESS_TOKEN_EXP);
  const refreshToken = await encrypt({ ...sessionData, type: 'refresh' }, REFRESH_TOKEN_EXP);

  // 3. Save NEW valid token ID to DB
  await updateDoc(userRef, { 
    validRefreshToken: newJti,
    lastLogin: new Date().toISOString()
  });

  return { accessToken, refreshToken };
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_access')?.value;
  if (!token) return null;
  return await decrypt(token);
}