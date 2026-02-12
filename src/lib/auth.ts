import { SignJWT, jwtVerify } from 'jose';

// 🟢 CRUCIAL: Check if secret exists, otherwise provide a fallback for build time
const secretString = process.env.JWT_SECRET || 'fallback_secret_for_build_only_change_in_vercel';
const SECRET_KEY = new TextEncoder().encode(secretString);

export async function encrypt(payload: any, expiresIn: string) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SECRET_KEY);
}

export async function decrypt(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, { 
      algorithms: ['HS256'] 
    });
    return payload;
  } catch (error) {
    // This catches expired tokens or secret mismatches
    return null;
  }
}