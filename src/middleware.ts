import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Get the REFRESH token (7-day) instead of access token (15-min)
  const refreshToken = req.cookies.get('session_refresh')?.value;
  
  console.log(`[Middleware] Path: ${pathname} | Token Found: ${!!refreshToken}`);

  // Try to decrypt - wrap in try/catch to prevent errors from causing loops
  let session = null;
  try {
    session = refreshToken ? await decrypt(refreshToken) : null;
    console.log(`[Middleware] Session Valid: ${!!session}`);
  } catch (error) {
    console.error('[Middleware] Decrypt Error:', error);
    // If decrypt fails, treat as no session (don't crash)
    session = null;
  }

  // 🛡️ PROTECTION LOGIC
  if (pathname.startsWith('/dashboard') && !session) {
    console.log("[Middleware] Redirecting to Login: No valid session.");
    const response = NextResponse.redirect(new URL('/', req.url));
    // Clear both invalid cookies to prevent loops
    response.cookies.delete('session_access');
    response.cookies.delete('session_refresh');
    return response;
  }

  // 🛡️ REVERSE PROTECTION - Only redirect from exact root paths
  if ((pathname === '/' || pathname === '/login') && session) {
    console.log("[Middleware] Redirecting to Dashboard: Session active.");
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
