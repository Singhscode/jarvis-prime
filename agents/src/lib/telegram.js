/**
 * JARVIS PRIME — Telegram Notifications
 * 
 * Sends real-time alerts to founder for hot leads and important events.
 * 
 * SETUP:
 * 1. Message @BotFather on Telegram
 * 2. Create new bot: /newbot
 * 3. Copy the token to .env as TELEGRAM_BOT_TOKEN
 * 4. Start a chat with your bot
 * 5. Get your chat ID: visit https://api.telegram.org/bot<TOKEN>/getUpdates
 * 6. Add chat ID to .env as TELEGRAM_CHAT_ID
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

/**
 * Send a Telegram message
 * @param {string} message - Message text (supports Markdown)
 * @param {Object} options - parse_mode, disable_notification
 * @returns {boolean} - Success status
 */
export async function sendTelegram(message, options = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("[Telegram] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID");
    return false;
  }

  const { 
    parseMode = "Markdown",
    disableNotification = false 
  } = options;

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
        disable_notification: disableNotification,
      }),
    });

    const data = await response.json();

    if (!data.ok) {
      console.error("[Telegram] API error:", data.description);
      return false;
    }

    console.log("[Telegram] Message sent successfully");
    return true;
  } catch (error) {
    console.error("[Telegram] Failed:", error.message);
    return false;
  }
}

/**
 * Send hot lead alert
 * @param {Object} lead - Lead data
 * @param {Object} icpResult - ICP score result
 * @param {string} intent - Classified intent
 */
export async function alertHotLead(lead, icpResult, intent) {
  const message = 
    `🔥 *HOT LEAD — Act Now!*\n\n` +
    `👤 *${lead.name}* @ ${lead.company}\n` +
    `📧 ${lead.email}\n` +
    `📱 ${lead.phone || "No phone"}\n` +
    `💰 Revenue: ${lead.revenue || "Unknown"}\n` +
    `🎯 ICP Score: ${icpResult.score}/25\n` +
    `🧠 Intent: ${intent}\n\n` +
    `📝 Message:\n_"${lead.message || "No message"}"_\n\n` +
    `✅ Auto-reply sent. Follow up personally within 1 hour!`;

  return sendTelegram(message);
}

/**
 * Send daily summary
 * @param {Object} stats - Daily statistics
 */
export async function sendDailySummary(stats) {
  const message = 
    `📊 *JARVIS PRIME Daily Report*\n` +
    `📅 ${new Date().toLocaleDateString("en-IN")}\n\n` +
    `📥 New Leads: ${stats.newLeads}\n` +
    `✅ Qualified: ${stats.qualified}\n` +
    `🔥 Hot Leads: ${stats.hotLeads}\n` +
    `📧 Emails Sent: ${stats.emailsSent}\n` +
    `📞 Calls Booked: ${stats.callsBooked}\n\n` +
    `💰 Pipeline Value: ₹${stats.pipelineValue?.toLocaleString("en-IN") || 0}`;

  return sendTelegram(message);
}

/**
 * Send error alert
 * @param {string} agentName - Which agent failed
 * @param {string} errorMessage - Error details
 */
export async function alertError(agentName, errorMessage) {
  const message = 
    `⚠️ *System Alert*\n\n` +
    `Agent: ${agentName}\n` +
    `Error: ${errorMessage}\n` +
    `Time: ${new Date().toLocaleString("en-IN")}`;

  return sendTelegram(message);
}
