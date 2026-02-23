'use server';

import { cookies } from 'next/headers';
import { encrypt } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { adminDb, adminAuth } from '@/lib/firebase-admin';

export async function loginAction(formData: FormData) {
  const username = (formData.get('username') as string).toLowerCase().trim();
  const password = formData.get('password') as string;

  try {
    // 1. Verify User Exists in Firestore (App Data Source)
    const userRef = adminDb.collection('users').doc(username);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return { success: false, message: 'Invalid credentials' };
    }
    const userData = userSnap.data();

    // 🔒 2. SECURE CREDENTIAL VERIFICATION (Firebase Auth)
    let authUser;
    try {
        authUser = await adminAuth.getUser(username);
    } catch (e: any) {
        if (e.code === 'auth/user-not-found') {
            authUser = null;
        } else {
            throw e;
        }
    }

    if (!authUser) {
        // MIGRATION: User exists in Firestore (legacy) but not Auth.
        // Fallback to legacy password check, then migrate.
        if (userData?.password === password) {
             logger.warn('Security', `Migrating legacy user to Auth: ${username}`);
             await adminAuth.createUser({
                 uid: username,
                 password: password,
                 email: `${username}@geocoverage.local`, // Use internal domain pattern
                 emailVerified: true
             });
             // Proceed as authenticated (since we just validated the legacy password)
        } else {
             return { success: false, message: 'Invalid credentials' };
        }
    } else {
        // User exists in Auth. Verify password using Identity Toolkit REST API.
        let emailToUse = authUser.email;
        if (!emailToUse) {
            // Fix missing email for existing auth users
            emailToUse = `${username}@geocoverage.local`;
            await adminAuth.updateUser(username, { email: emailToUse, emailVerified: true });
        }

        const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
        if (!apiKey) {
            logger.error('Auth', 'Missing NEXT_PUBLIC_FIREBASE_API_KEY');
            return { success: false, message: 'System configuration error.' };
        }

        const verifyResponse = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: emailToUse,
                    password: password,
                    returnSecureToken: true
                })
            }
        );

        if (!verifyResponse.ok) {
            // DESYNC RECOVERY: If Auth failed, check if the password matches the legacy Firestore store.
            // This happens if a user changed their password via the old UI (which only updated Firestore).
            if (userData?.password === password) {
                logger.warn('Security', `Password desync detected for ${username}. Syncing Auth with Firestore.`);

                // Update Auth to match the correct password
                await adminAuth.updateUser(username, {
                    password: password,
                    emailVerified: true
                });

                // Proceed as authenticated since we validated against the source of truth (Firestore)
            } else {
                const errorData = await verifyResponse.json();
                logger.warn('Auth', `Login failed for ${username}: ${errorData.error?.message}`);
                return { success: false, message: 'Invalid credentials' };
            }
        }
    }

    const tokenId = crypto.randomUUID();

    // 3. Create JWT Payloads
    const sessionPayload = {
      uid: username,
      role: userData?.role,
      permissions: userData?.permissions || {},
      jti: tokenId
    };

    // 4. Generate Tokens
    const accessToken = await encrypt({ ...sessionPayload, type: 'access' }, '15m');
    const refreshToken = await encrypt({ ...sessionPayload, type: 'refresh' }, '7d');

    // 5. Generate Firebase Custom Token for Client SDK Auth
    // This allows the client-side Firebase SDK to be authenticated as the user
    // ensuring Firestore Security Rules work correctly.
    let customToken;
    try {
      customToken = await adminAuth.createCustomToken(username, {
        role: userData?.role
      });
    } catch (tokenError) {
      console.error("Failed to generate custom token:", tokenError);
      // We continue, but client-side Firestore access might be limited.
    }

    // 6. Store Valid Token ID in DB (Using Admin SDK)
    await userRef.update({ 
      validRefreshToken: tokenId,
      lastLogin: new Date().toISOString()
    });

    // 7. Set Secure Cookies
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
    return { success: true, customToken };

  } catch (error: any) {
    console.error("LOGIN ERROR:", error); 
    return { 
      success: false, 
      message: 'A system error occurred. Please try again later.'
    };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  // 🟢 Ensure we delete cookies from the root path
  cookieStore.set('session_access', '', { path: '/', maxAge: 0 });
  cookieStore.set('session_refresh', '', { path: '/', maxAge: 0 });
}
