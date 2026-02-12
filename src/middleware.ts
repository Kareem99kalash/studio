import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 1. Define your boundaries clearly
  const isProtectedRoute = path.startsWith('/dashboard');
  const isPublicRoute = path === '/' || path === '/login';

  // 2. Get the Access Token
  const token = req.cookies.get('session_access')?.value;
  const session = await decrypt(token || '');

  // 🛡️ REDIRECT 1: If trying to access Dashboard WITHOUT a session -> Go to Login
  if (isProtectedRoute && !session) {
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  // 🛡️ REDIRECT 2: If trying to access Login WITH a valid session -> Go to Dashboard
  if (isPublicRoute && session) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl));
  }

  return NextResponse.next();
}

// 🟢 CRUCIAL: Ensure the matcher excludes static assets and API routes
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
