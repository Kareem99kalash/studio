import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { decrypt } from '@/lib/auth';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_access')?.value;

  if (!token) return NextResponse.json({ user: null }, { status: 401 });

  const payload = await decrypt(token);
  if (!payload) return NextResponse.json({ user: null }, { status: 401 });

  return NextResponse.json({
    user: {
      uid: payload.uid,
      role: payload.role,
      permissions: payload.permissions,
    }
  });
}