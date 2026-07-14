import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ── Security headers ──────────────────────────────────────────────────────────

function applySecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

// In-memory store — adequate for a low-traffic internal portal.
// For edge / multi-region deployments, replace with Upstash Redis.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimit(ip: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return true; // allowed
  }

  if (record.count >= limit) return false; // blocked

  record.count += 1;
  return true; // allowed
}

// ── Cookie verification ───────────────────────────────────────────────────────

const COOKIE_NAME = 'portal_token';

/**
 * Verifies the HMAC-signed portal cookie set by /api/portal-auth.
 * Format expected: <nonce>.<hmac_sha256_hex>
 *
 * Returns true only when:
 *   1. The cookie exists and is correctly formatted.
 *   2. The HMAC of the nonce matches the signature (constant-time compare).
 *   3. PORTAL_COOKIE_SECRET is configured on the server.
 *
 * A copied cookie value is still valid for its lifetime — this is intentional
 * for a shared-password portal. The HMAC prevents *forged* cookies (anyone
 * setting portal_token=anything-they-like to bypass the login page).
 */
async function isValidPortalCookie(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;

  const secret = process.env.PORTAL_COOKIE_SECRET;
  if (!secret) {
    // Misconfigured: no secret → reject all access (fail closed)
    console.error('[middleware] PORTAL_COOKIE_SECRET is not set — all portal access denied.');
    return false;
  }

  const dotIndex = cookieValue.lastIndexOf('.');
  if (dotIndex === -1) return false;

  const nonce = cookieValue.slice(0, dotIndex);
  const providedSig = cookieValue.slice(dotIndex + 1);
  if (!nonce || !/^[a-f0-9]{64}$/i.test(providedSig)) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(nonce))
  );
  const provided = Uint8Array.from(
    providedSig.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
  );

  let difference = 0;
  for (let index = 0; index < signature.length; index += 1) {
    difference |= signature[index] ^ provided[index];
  }
  return difference === 0;
}

// ── Middleware ────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  applySecurityHeaders(response);

  // Rate-limit all API routes
  if (pathname.startsWith('/api/')) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';

    if (!rateLimit(ip, 10, 60_000)) {
      return new NextResponse('Too many requests', { status: 429 });
    }
  }

  // Protect internal portal pages
  const protectedPaths = ['/dashboard', '/leads', '/tasks'];
  const isProtectedPath = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtectedPath) {
    const cookieValue = request.cookies.get(COOKIE_NAME)?.value;

    if (!(await isValidPortalCookie(cookieValue))) {
      // Clear any stale / forged cookie before redirecting
      const redirectResponse = NextResponse.redirect(
        new URL('/portal-auth', request.url)
      );
      applySecurityHeaders(redirectResponse);
      redirectResponse.cookies.delete(COOKIE_NAME);
      return redirectResponse;
    }
  }

  return response;
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*', '/leads/:path*', '/tasks/:path*'],
};
