import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = await request.json();

    // Get the correct password from env (you'll set this in Vercel)
    const correctPassword = process.env.PORTAL_PASSWORD || 'jarvis2026';

    if (password === correctPassword) {
      // Set an HttpOnly cookie (more secure than localStorage)
      const response = NextResponse.json({ ok: true });
      response.cookies.set('portal_authenticated', 'true', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      });
      return response;
    } else {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
  } catch (error) {
    console.error('[portal-auth] Error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
