import { NextRequest, NextResponse } from 'next/server';
import { rotateTokens } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get('session_refresh')?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: 'No token' }, { status: 401 });
  }

  try {
    const tokens = await rotateTokens(refreshToken);

    cookieStore.set('session_access', tokens.accessToken, {
      httpOnly: true, secure: true, sameSite: 'lax', expires: Date.now() + 15 * 60 * 1000
    });
    
    cookieStore.set('session_refresh', tokens.refreshToken, {
      httpOnly: true, secure: true, sameSite: 'lax', expires: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Rotation failed' }, { status: 403 });
  }
}