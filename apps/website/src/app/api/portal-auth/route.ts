/**
 * POST /api/portal-auth
 *
 * Server-side portal login endpoint.
 * - Password is read from PORTAL_PASSWORD (server-only env var — never NEXT_PUBLIC_).
 * - Comparison is constant-time (prevents timing attacks).
 * - On success, sets an HttpOnly, Secure, SameSite=Strict cookie containing an
 *   HMAC-SHA256 signature so the middleware can verify it hasn't been forged.
 *
 * Required env vars (set in Vercel → Environment Variables, NOT in .env.local):
 *   PORTAL_PASSWORD     The shared portal password.
 *   PORTAL_COOKIE_SECRET  32+ char random string used to sign the cookie value.
 *                        Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHmac, randomBytes } from 'crypto';

const COOKIE_NAME = 'portal_token';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Rate limiting — simple in-memory store (resets on cold start, but adequate
// for a low-traffic internal portal). Use Upstash Redis for edge deployments.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = attempts.get(ip);

  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }

  if (record.count >= MAX_ATTEMPTS) return true;

  record.count += 1;
  return false;
}

/**
 * Signs a value with HMAC-SHA256 so the middleware can verify it later.
 * Format: <random_nonce>.<hmac_hex>
 */
function signCookieValue(secret: string): string {
  const nonce = randomBytes(16).toString('hex');
  const sig = createHmac('sha256', secret).update(nonce).digest('hex');
  return `${nonce}.${sig}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  // Rate limit before doing any work
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 15 minutes.' },
      { status: 429 }
    );
  }

  // Parse body — accept JSON or form data
  let password = '';
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = await request.json();
      password = typeof body.password === 'string' ? body.password : '';
    } else {
      const form = await request.formData();
      password = typeof form.get('password') === 'string' ? (form.get('password') as string) : '';
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!password) {
    return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
  }

  const correctPassword = process.env.PORTAL_PASSWORD;
  const cookieSecret = process.env.PORTAL_COOKIE_SECRET;

  // Fail closed: if secrets aren't configured, refuse all logins
  if (!correctPassword || !cookieSecret) {
    console.error(
      '[portal-auth] PORTAL_PASSWORD or PORTAL_COOKIE_SECRET is not set. ' +
      'Configure them in your environment variables.'
    );
    return NextResponse.json(
      { error: 'Portal is not configured. Contact the administrator.' },
      { status: 503 }
    );
  }

  // Constant-time comparison — prevents timing attacks that leak password length
  let passwordsMatch = false;
  try {
    const a = Buffer.from(password.padEnd(128));
    const b = Buffer.from(correctPassword.padEnd(128));
    // timingSafeEqual requires same-length buffers
    if (a.length === b.length) {
      passwordsMatch = timingSafeEqual(a, b) && password === correctPassword;
    }
  } catch {
    passwordsMatch = false;
  }

  if (!passwordsMatch) {
    // Generic message — don't reveal whether the user or password was wrong
    return NextResponse.json(
      { error: 'Incorrect password.' },
      { status: 401 }
    );
  }

  // Auth passed — build a signed token and set it in a secure cookie
  const cookieValue = signCookieValue(cookieSecret);

  const response = NextResponse.json({ ok: true });

  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,                                    // Not accessible from JS
    secure: process.env.NODE_ENV === 'production',    // HTTPS-only in prod
    sameSite: 'strict',                               // No cross-site sending
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: '/',
  });

  return response;
}
