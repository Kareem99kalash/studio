// 🟢 FIXED: Both imports must come from 'next/server'
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server'; 
import { decrypt } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const accessToken = req.cookies.get('session_access')?.value;
  const session = accessToken ? await decrypt(accessToken) : null;

  // 🛡️ If on dashboard without session -> Login
  if (pathname.startsWith('/dashboard') && !session) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // 🛡️ If on login with valid session -> Dashboard
  if ((pathname === '/' || pathname === '/login') && session) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
