import nodemailer from "nodemailer";

let gmailTransporter = null;

function getGmailTransporter() {
  if (gmailTransporter) return gmailTransporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) return null;

  gmailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return gmailTransporter;
}

export async function sendEmail({ to, subject, html, replyTo }) {
  // ── Option 1: Gmail SMTP (preferred when configured) ──
  const gmail = getGmailTransporter();
  if (gmail) {
    try {
      const founderName = process.env.FOUNDER_NAME || "Anuj Singh";
      const fromName = `${founderName} | JARVIS PRIME`;
      const info = await gmail.sendMail({
        from: `"${fromName}" <${process.env.GMAIL_USER}>`,
        to: Array.isArray(to) ? to.join(", ") : to,
        subject,
        html,
        replyTo: replyTo || process.env.GMAIL_USER,
      });
      console.log(`[Gmail] Email sent → ${to} | Subject: ${subject}`);
      return info.messageId;
    } catch (err) {
      console.error("[Gmail] Send failed:", err.message);
      return null;
    }
  }

  // ── Option 2: Resend API fallback ──
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Email] No GMAIL_APP_PASSWORD or RESEND_API_KEY — skipping email");
    return null;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "JARVIS PRIME <hello@jarvis-prime.in>",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      reply_to: replyTo || process.env.FOUNDER_EMAIL,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error("[Resend] Send failed:", data);
    return null;
  }

  console.log(`[Resend] Email sent → ${to} | Subject: ${subject}`);
  return data.id;
}
