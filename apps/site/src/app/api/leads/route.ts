import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { Lead } from "@/types/lead";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, company, email, phone, revenue, message } = body;

    if (!name || !company || !email) {
      return NextResponse.json(
        { error: "name, company, and email are required" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const lead: Lead = {
      name: name.trim(),
      company: company.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim() || null,
      revenue: revenue || null,
      message: message?.trim() || null,
      source: "website_form",
      status: "new",
    };

    // If Supabase is not configured, just return success
    if (!supabaseAdmin) {
      console.warn("[API /leads] Supabase not configured, skipping database save");
      await Promise.allSettled([
        sendTelegramAlert(lead),
        triggerN8nWebhook(lead),
      ]);
      return NextResponse.json(
        { success: true, message: "Lead received (database not configured)", id: "local" },
        { status: 201 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("leads")
      .insert([lead])
      .select()
      .single();

    if (error) {
      console.error("[Supabase] Insert error:", error);
      return NextResponse.json({ error: "Failed to save lead" }, { status: 500 });
    }

    await Promise.allSettled([
      sendTelegramAlert(data),
      triggerN8nWebhook(data),
    ]);

    return NextResponse.json(
      { success: true, message: "Lead saved successfully", id: data.id },
      { status: 201 }
    );
  } catch (err) {
    console.error("[API /leads] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { leads: [], count: 0, message: "Database not configured" },
        { status: 200 }
      );
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");

    let query = supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Supabase] Fetch error:", error);
      return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
    }

    return NextResponse.json({ leads: data, count: data.length }, { status: 200 });
  } catch (err) {
    console.error("[API /leads GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function sendTelegramAlert(lead: Lead) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId   = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn("[Telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping alert");
    return;
  }

  const text = buildAlertMessage(lead);

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "Markdown",
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error("[Telegram] sendMessage failed:", res.status, body);
    } else {
      console.log("[Telegram] Alert sent for lead:", lead.email);
    }
  } catch (err) {
    console.error("[Telegram] Request error:", err);
  }
}

async function triggerN8nWebhook(lead: Lead) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "new_lead",
        lead,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      console.error("[n8n] Webhook failed:", response.status, await response.text());
    } else {
      console.log("[n8n] Webhook triggered for lead:", lead.email);
    }
  } catch (err) {
    console.error("[n8n] Webhook request error:", err);
  }
}

function buildAlertMessage(lead: Lead): string {
  return `🚨 *NEW LEAD — JARVIS PRIME*

👤 *Name:* ${lead.name}
🏢 *Company:* ${lead.company}
📧 *Email:* ${lead.email}
📱 *Phone:* ${lead.phone || "Not provided"}
💰 *Revenue:* ${lead.revenue || "Not provided"}
💬 *Message:* ${lead.message || "No message"}

⚡ *Source:* Website Form
🕐 *Time:* ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}

Reply within 2 hours to close this lead\! 🎯`;
}
