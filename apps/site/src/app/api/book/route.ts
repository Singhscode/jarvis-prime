import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Booking endpoint — captures a "Book a Call" form submission.
 *
 * Flow:
 *  1. Validates the incoming fields.
 *  2. Inserts the lead into Supabase `leads` (source = "website").
 *     The inbound agent then scores it, replies, and alerts on Telegram.
 *  3. Optionally fires an instant Telegram alert to the founder.
 *
 * Required Vercel env vars:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *  - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID  (instant alert)
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = (body.name || '').toString().trim();
    const email = (body.email || '').toString().trim();
    const company = (body.company || '').toString().trim();
    const phone = (body.phone || '').toString().trim();
    const message = (body.message || '').toString().trim();

    // Validation
    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('[book] Supabase env vars missing');
      return NextResponse.json(
        { error: 'Server is not configured yet. Please try again shortly.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Insert lead (upsert on email so duplicates don't error out)
    const { error } = await supabase.from('leads').upsert(
      {
        name,
        email,
        company: company || null,
        phone: phone || null,
        message: message || 'Booked a strategy call from website',
        source: 'website',
        status: 'new',
      },
      { onConflict: 'email' }
    );

    if (error) {
      console.error('[book] Supabase insert error:', error.message);
      return NextResponse.json({ error: 'Could not save your request.' }, { status: 500 });
    }

    // Optional: instant Telegram alert to founder
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChat = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChat) {
      const text =
        `📅 *New Strategy Call Request*\n\n` +
        `👤 ${name}\n` +
        `✉️ ${email}\n` +
        (company ? `🏢 ${company}\n` : '') +
        (phone ? `📞 ${phone}\n` : '') +
        (message ? `💬 ${message}\n` : '');
      // Fire and forget — don't block the response on Telegram
      fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChat, text, parse_mode: 'Markdown' }),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[book] Unexpected error:', err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
