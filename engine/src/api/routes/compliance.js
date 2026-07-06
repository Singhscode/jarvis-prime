// Compliance API Route
// Public-facing endpoints for CAN-SPAM / India DPDP compliance.
// Includes: unsubscribe page, unsubscribe handler, and open tracking pixel.

import express from 'express';
import { addSuppression, isSuppressed, insertEvent } from '../../lib/db.js';
import { config } from '../../config.js';
import { log } from '../../lib/logger.js';

const router = express.Router();

// GET /unsubscribe — Public unsubscribe page (HTML, no auth required)
router.get('/', (req, res) => {
  const email = req.query.email || '';
  const success = req.query.success === 'true';

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe — ${config.fromName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #030712;
      color: #e2e8f0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 16px;
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
      text-align: center;
    }
    h1 { font-size: 24px; margin-bottom: 8px; color: #fff; }
    .subtitle { color: #94a3b8; margin-bottom: 32px; font-size: 15px; }
    .email-display {
      background: rgba(6,182,212,0.05);
      border: 1px solid rgba(6,182,212,0.15);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 24px;
      color: #06b6d4;
      font-weight: 600;
      word-break: break-all;
    }
    button {
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 10px;
      padding: 14px 32px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover { background: #dc2626; transform: translateY(-1px); }
    .success-msg {
      background: rgba(34,197,94,0.08);
      border: 1px solid rgba(34,197,94,0.2);
      border-radius: 12px;
      padding: 20px;
      color: #22c55e;
    }
    .footer { margin-top: 32px; color: #475569; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    ${success ? `
      <div class="success-msg">
        <h1>✅ Unsubscribed</h1>
        <p style="margin-top: 8px; color: #94a3b8;">You have been removed from our mailing list.</p>
        <p style="margin-top: 12px; color: #64748b; font-size: 13px;">You will no longer receive emails from us. If this was a mistake, reply to any previous email.</p>
      </div>
    ` : `
      <h1>Unsubscribe</h1>
      <p class="subtitle">We're sorry to see you go. Click below to stop receiving emails.</p>
      ${email ? `<div class="email-display">${escapeHtml(email)}</div>` : ''}
      <form method="POST" action="/unsubscribe">
        <input type="hidden" name="email" value="${escapeHtml(email)}" />
        <button type="submit">Unsubscribe Me</button>
      </form>
    `}
    <p class="footer">${config.fromName} · ${config.postalAddress}</p>
  </div>
</body>
</html>`);
});

// POST /unsubscribe — Process unsubscribe request
router.post('/', express.urlencoded({ extended: false }), async (req, res) => {
  const email = req.body.email;

  if (!email || !email.includes('@')) {
    return res.status(400).send('Invalid email address.');
  }

  try {
    await addSuppression(email.toLowerCase(), 'unsubscribe');
    log.info(`Unsubscribed: ${email}`);
    res.redirect(`/unsubscribe?email=${encodeURIComponent(email)}&success=true`);
  } catch (err) {
    log.error(`Unsubscribe failed for ${email}: ${err.message}`);
    res.status(500).send('Something went wrong. Please try again.');
  }
});

// GET /pixel/:messageId — Open tracking pixel (1x1 transparent GIF)
router.get('/pixel/:messageId', async (req, res) => {
  const { messageId } = req.params;

  try {
    await insertEvent({
      message_id: messageId,
      type: 'open',
      meta: {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Non-critical — don't fail the pixel response
  }

  // 1x1 transparent GIF
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.send(pixel);
});

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default router;
