import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Define Routes
  const isProtectedRoute = pathname.startsWith('/dashboard');
  const isPublicRoute = pathname === '/' || pathname === '/login';

  // 2. Get Cookie
  const accessToken = req.cookies.get('session_access')?.value;
  
  // 3. Decrypt Session
  const session = accessToken ? await decrypt(accessToken) : null;

  // 🔍 DEBUG LOGS (Visible in Vercel Logs tab)
  if (isProtectedRoute && !session) {
    console.log(`[Middleware] ❌ Access Denied to ${pathname}. No valid token.`);
    return NextResponse.redirect(new URL('/', req.url));
  }

  if (isPublicRoute && session) {
    console.log(`[Middleware] ✅ Valid session found. Skipping login.`);
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
