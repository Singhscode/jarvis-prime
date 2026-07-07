// Loads configuration from environment variables with safe defaults.
// Reads a local .env file if present (no external dependency needed).
//
// Upgraded with:
//   - Environment detection (development/staging/production)
//   - Config validation on startup
//   - getClientConfig() for per-client overrides
//   - providerStatus() for health checks

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchVaultSecrets } from './lib/vault.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (avoids adding a dependency).
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

// Load secrets from HashiCorp Vault dynamically at boot
const vaultSecrets = await fetchVaultSecrets();
const env = { ...process.env, ...vaultSecrets };

const bool = (v, fallback) => {
  if (v === undefined) return fallback;
  return String(v).toLowerCase() === 'true';
};
const num = (v, fallback) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  // Environment
  env: env.NODE_ENV || 'development',

  // Safety
  dryRun: bool(env.DRY_RUN, true),
  dailyProspectLimit: num(env.DAILY_PROSPECT_LIMIT, 25),
  dailySendLimit: num(env.DAILY_SEND_LIMIT, 40),

  // Server (for HTTP mode)
  port: num(env.PORT, 3001),
  automationSecret: env.AUTOMATION_SERVER_SECRET || 'dev-secret',

  // Database
  supabaseUrl: env.SUPABASE_URL || '',
  supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Sourcing
  apolloApiKey: env.APOLLO_API_KEY || '',
  hunterApiKey: env.HUNTER_API_KEY || '',

  // AI
  groqApiKey: env.GROQ_API_KEY || '',
  groqModel: env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  // AI — OpenAI (alternative provider)
  openaiApiKey: env.OPENAI_API_KEY || '',
  openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',

  // AI — provider selection
  aiProvider: env.AI_PROVIDER || 'groq', // 'groq' | 'openai'

  // Email — provider selection
  emailProvider: env.EMAIL_PROVIDER || 'resend', // 'resend' | 'sendgrid'

  // Email — Resend
  resendApiKey: env.RESEND_API_KEY || '',
  fromName: env.FROM_NAME || 'JARVIS PRIME',
  fromEmail: env.FROM_EMAIL || 'hello@jarvisprime.me',
  replyToEmail: env.REPLY_TO_EMAIL || 'hello@jarvisprime.me',

  // Email — SendGrid (alternative provider)
  sendgridApiKey: env.SENDGRID_API_KEY || '',

  // LinkedIn automation
  linkedinCookie: env.LINKEDIN_COOKIE || '',        // li_at session cookie
  linkedinCsrf: env.LINKEDIN_CSRF || '',            // JSESSIONID CSRF token
  linkedinDailyConnects: num(env.LINKEDIN_DAILY_CONNECTS, 20),
  linkedinDailyDMs: num(env.LINKEDIN_DAILY_DMS, 30),
  linkedinDailyViews: num(env.LINKEDIN_DAILY_VIEWS, 50),

  // Calendar (Cal.com)
  calcomApiKey: env.CALCOM_API_KEY || '',
  calcomBaseUrl: env.CALCOM_BASE_URL || 'https://api.cal.com',
  calcomEventTypeId: num(env.CALCOM_EVENT_TYPE_ID, 0),
  calcomBookingUrl: env.CALCOM_BOOKING_URL || 'https://cal.com/jarvisprime/strategy-call',

  // Alerts — Telegram
  telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: env.TELEGRAM_CHAT_ID || '',

  // Alerts — Slack
  slackWebhookUrl: env.SLACK_WEBHOOK_URL || '',
  slackChannel: env.SLACK_CHANNEL || '#jarvis-alerts',

  // Alerts — WhatsApp (via Twilio)
  twilioAccountSid: env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: env.TWILIO_AUTH_TOKEN || '',
  twilioWhatsappFrom: env.TWILIO_WHATSAPP_FROM || '',  // e.g. whatsapp:+14155238886
  whatsappAlertTo: env.WHATSAPP_ALERT_TO || '',        // e.g. whatsapp:+918810500723

  // Scheduler
  schedulerEnabled: bool(env.SCHEDULER_ENABLED, true),
  schedulerTimezone: env.SCHEDULER_TIMEZONE || 'Asia/Kolkata',

  // A/B Testing
  abTestMinSample: num(env.AB_TEST_MIN_SAMPLE, 50),

  // Compliance
  postalAddress: env.COMPANY_POSTAL_ADDRESS || 'JARVIS PRIME, Gurgaon, Haryana, India',
  unsubscribeUrl: env.UNSUBSCRIBE_URL || 'https://www.jarvisprime.me/unsubscribe',

  // CORS
  corsOrigins: env.CORS_ORIGINS || 'http://localhost:3000,https://www.jarvisprime.me',

  // Outreach sequence defaults (overridable per-client via DB config)
  defaultMaxSteps: num(env.DEFAULT_MAX_STEPS, 3),
  defaultFollowupDays: (env.DEFAULT_FOLLOWUP_DAYS || '0,3,4').split(',').map(Number),

  // Scoring defaults (overridable per-client via DB config)
  defaultScoringWeights: {
    title: num(env.SCORING_WEIGHT_TITLE, 10),
    industry: num(env.SCORING_WEIGHT_INDUSTRY, 8),
    location: num(env.SCORING_WEIGHT_LOCATION, 4),
    keyword: num(env.SCORING_WEIGHT_KEYWORD, 2),
    email: num(env.SCORING_WEIGHT_EMAIL, 2),
  },
  defaultQualifyThreshold: num(env.QUALIFY_THRESHOLD, 15),
  defaultHotThreshold: num(env.HOT_THRESHOLD, 24),
};

/**
 * Get client-specific config by merging global defaults with per-client DB overrides.
 * @param {object} client  The client row (must have a .config JSON field)
 * @returns {object} Merged config for this client
 */
export function getClientConfig(client) {
  const clientOverrides = client?.config || {};
  return {
    maxSteps: clientOverrides.maxSteps ?? config.defaultMaxSteps,
    followupDays: clientOverrides.followupDays ?? config.defaultFollowupDays,
    dailySendLimit: clientOverrides.dailySendLimit ?? config.dailySendLimit,
    dailyProspectLimit: clientOverrides.dailyProspectLimit ?? config.dailyProspectLimit,
    scoringWeights: { ...config.defaultScoringWeights, ...(clientOverrides.scoringWeights || {}) },
    qualifyThreshold: clientOverrides.qualifyThreshold ?? config.defaultQualifyThreshold,
    hotThreshold: clientOverrides.hotThreshold ?? config.defaultHotThreshold,
    disqualifiers: clientOverrides.disqualifiers ?? null, // null = use defaults
  };
}

// Returns which providers are configured (helps the "doctor" command).
export function providerStatus() {
  return {
    database: Boolean(config.supabaseUrl && config.supabaseKey),
    apollo: Boolean(config.apolloApiKey),
    hunter: Boolean(config.hunterApiKey),
    groq: Boolean(config.groqApiKey),
    openai: Boolean(config.openaiApiKey),
    resend: Boolean(config.resendApiKey),
    sendgrid: Boolean(config.sendgridApiKey),
    linkedin: Boolean(config.linkedinCookie),
    calcom: Boolean(config.calcomApiKey),
    telegram: Boolean(config.telegramBotToken && config.telegramChatId),
    slack: Boolean(config.slackWebhookUrl),
    whatsapp: Boolean(config.twilioAccountSid && config.twilioWhatsappFrom),
    scheduler: config.schedulerEnabled,
  };
}
