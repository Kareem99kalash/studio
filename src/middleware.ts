import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Get tokens - explicitly check the cookie name
  const accessToken = req.cookies.get('session_access')?.value;
  
  // 2. Log for Vercel debugging
  console.log(`[Middleware] Path: ${pathname} | Token Found: ${!!accessToken}`);

  const session = accessToken ? await decrypt(accessToken) : null;

  // 🛡️ PROTECTION LOGIC
  // If attempting to enter dashboard without a valid session
  if (pathname.startsWith('/dashboard') && !session) {
    console.log("[Middleware] Redirecting to Login: Session invalid or missing.");
    return NextResponse.redirect(new URL('/', req.url));
  }

  // 🛡️ REVERSE PROTECTION
  // If already logged in but trying to visit Login/Home
  if ((pathname === '/' || pathname === '/login') && session) {
    console.log("[Middleware] Redirecting to Dashboard: Session already active.");
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  // 🟢 Match all paths except static files, images, and API routes
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
