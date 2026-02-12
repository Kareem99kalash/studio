import { SignJWT, jwtVerify } from 'jose';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { logger } from '@/lib/logger';

// Ensure the secret is converted to a Uint8Array for the 'jose' library
const secretString = process.env.JWT_SECRET || 'fallback_secret_for_build_only';
const SECRET_KEY = new TextEncoder().encode(secretString);

const ACCESS_TOKEN_EXP = '15m'; 
const REFRESH_TOKEN_EXP = '7d';

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
 * This must be exported so the API route can find it.
 */
export async function rotateTokens(oldRefreshToken: string) {
  const payload = await decrypt(oldRefreshToken);
  
  if (!payload || !payload.uid || !payload.jti) {
    throw new Error('Invalid Token');
  }

  const userId = payload.uid as string;
  const tokenId = payload.jti as string;

  // Check DB for this specific token to prevent reuse attacks
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) throw new Error('User not found');
  const userData = userSnap.data();

  // If the sent token doesn't match the DB, it's a reuse attempt (breach)
  if (userData.validRefreshToken !== tokenId) {
    logger.error('Security', `Refresh token reuse detected for: ${userId}`);
    await updateDoc(userRef, { validRefreshToken: null }); 
    throw new Error('Token Reuse Detected');
  }

  // Generate NEW identity pair
  const newJti = crypto.randomUUID();
  const sessionData = { 
    uid: userId, 
    role: userData.role, 
    permissions: userData.permissions,
    jti: newJti 
  };

  const accessToken = await encrypt({ ...sessionData, type: 'access' }, ACCESS_TOKEN_EXP);
  const refreshToken = await encrypt({ ...sessionData, type: 'refresh' }, REFRESH_TOKEN_EXP);

  // Update DB with the new valid token ID
  await updateDoc(userRef, { 
    validRefreshToken: newJti,
    lastLogin: new Date().toISOString()
  });

  return { accessToken, refreshToken };
}