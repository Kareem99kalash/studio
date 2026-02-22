import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/auth';
import { adminDb } from '@/lib/firebase-admin'; // Use Admin SDK for reliable role fetching

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Check for refresh token (the 7-day session token)
    const refreshToken = cookieStore.get('session_refresh')?.value;
    
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Decrypt and verify the token
    const session = await decrypt(refreshToken);
    
    if (!session || !session.uid || typeof session.uid !== 'string') {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // 🟢 CRITICAL FIX: Fetch fresh permissions from Firestore
    // The cookie might contain stale permissions if the admin just updated them.
    // We trust the cookie for identity (uid), but we should fetch roles/permissions from DB.
    let userPermissions = session.permissions || {};
    let userRole = session.role;

    try {
        const userDoc = await adminDb.collection('users').doc(session.uid as string).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            userRole = userData?.role || userRole;
            userPermissions = userData?.permissions || userPermissions;
        }
    } catch (dbError) {
        console.warn("[API /auth/me] Failed to fetch fresh permissions from Firestore, using session cache.", dbError);
    }

    // Return user data with fresh permissions
    return NextResponse.json({
      user: {
        uid: session.uid,
        username: session.uid,
        role: userRole,
        permissions: userPermissions,
        groupId: session.groupId // If group ID is in session, pass it. If not, maybe fetch it too.
      }
    });

  } catch (error) {
    console.error('[API /auth/me] Error:', error);
    return NextResponse.json(
      { error: 'Session verification failed' },
      { status: 401 }
    );
  }
}
