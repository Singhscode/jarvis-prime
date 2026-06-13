import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Portal pages that require authentication
  const protectedPaths = ['/dashboard', '/leads', '/tasks'];
  const isProtectedPath = protectedPaths.some((path) => pathname.startsWith(path));

  if (isProtectedPath) {
    // Check for portal auth cookie
    const authCookie = request.cookies.get('portal_authenticated');

    // If not authenticated, redirect to password page
    if (!authCookie) {
      return NextResponse.redirect(new URL('/portal-auth', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/leads/:path*', '/tasks/:path*'],
};
