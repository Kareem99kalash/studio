import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/auth';

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
    
    if (!session || !session.uid) {
      return NextResponse.json(
        { error: 'Invalid session' },
        { status: 401 }
      );
    }

    // Return user data from the session
    return NextResponse.json({
      user: {
        uid: session.uid,
        username: session.uid, // Your session uses uid as username
        role: session.role,
        permissions: session.permissions || {},
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
