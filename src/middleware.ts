import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { decrypt } from '@/lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Get the REFRESH token (7-day) instead of access token (15-min)
  const refreshToken = req.cookies.get('session_refresh')?.value;
  
  console.log(`[Middleware] Path: ${pathname} | Token: ${!!refreshToken}`);

  // Try to decrypt - wrap in try/catch to prevent errors from causing loops
  let session = null;
  try {
    session = refreshToken ? await decrypt(refreshToken) : null;
    console.log(`[Middleware] Session Valid: ${!!session} for ${pathname}`);
  } catch (error) {
    console.error('[Middleware] Decrypt Error:', error);
    session = null;
  }

  // 🛡️ PROTECTION LOGIC - Require auth for dashboard
  if (pathname.startsWith('/dashboard')) {
    if (!session) {
      console.log("[Middleware] ❌ No session - Redirecting to /");
      const response = NextResponse.redirect(new URL('/', req.url));
      response.cookies.delete('session_access');
      response.cookies.delete('session_refresh');
      return response;
    }
    // Has session, allow through
    console.log("[Middleware] ✅ Has session - Allowing /dashboard");
    return NextResponse.next();
  }

  // 🛡️ REVERSE PROTECTION - Redirect logged-in users away from login page
  if ((pathname === '/' || pathname === '/login') && session) {
    console.log("[Middleware] ✅ Has session - Redirecting to /dashboard");
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // All other paths - allow through
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files with extensions
     */
    '/((?!api|_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\..+$).*)' 
  ],
};
