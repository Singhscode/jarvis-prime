// Webhook Service
// Processes inbound webhooks from external services (Resend, Cal.com, CRM, n8n).
// Routes events to the appropriate handlers and logs everything for debugging.

import { log } from '../utils/logger.js';
import { handleReply } from '../ai/agents/inbound-agent.js';
import * as calendarService from '../modules/meetings/calendar.service.js';
import { getDb, _memory as mem } from '../database/db.js';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const MAX_WEBHOOK_BYTES = 256 * 1024;
const TOLERANCE_SECONDS = 5 * 60; // 5 minutes

// In-memory webhook event log
const webhookLog = [];

/**
 * Process an inbound email reply webhook (from Resend/Postmark).
 */
export async function processInboundEmail(payload) {
  const event = logWebhookEvent('resend', 'email.reply', payload);

  try {
    const { from, subject, text, html } = payload;
    const senderEmail = extractEmail(from);

    if (!senderEmail) {
      event.status = 'failed';
      event.error = 'Could not extract sender email';
      return { processed: false, error: 'Invalid sender' };
    }

    // Find the prospect by email
    const prospect = await findProspectByEmail(senderEmail);
    if (!prospect) {
      event.status = 'processed';
      log.info(`[Webhook] Reply from unknown email: ${senderEmail}`);
      return { processed: true, matched: false, email: senderEmail };
    }

    // Find the client for this prospect
    const client = await findClientById(prospect.client_id);

    // Process via inbound agent
    const intent = await handleReply(prospect, text || html || '', client);

    event.status = 'processed';
    event.processed_at = new Date().toISOString();

    return { processed: true, matched: true, email: senderEmail, intent };
  } catch (err) {
    event.status = 'failed';
    event.error = err.message;
    throw err;
  }
}

/**
 * Process a calendar webhook (from Cal.com).
 */
export async function processCalendarWebhook(payload) {
  const event = logWebhookEvent('calcom', payload.triggerEvent || 'unknown', payload);

  try {
    const result = await calendarService.handleBookingWebhook(payload);
    event.status = 'processed';
    event.processed_at = new Date().toISOString();
    return result;
  } catch (err) {
    event.status = 'failed';
    event.error = err.message;
    throw err;
  }
}

/**
 * Process a CRM sync webhook (HubSpot, Pipedrive, etc.).
 */
export async function processCRMWebhook(payload) {
  const event = logWebhookEvent('crm', payload.event_type || 'sync', payload);

  try {
    const { event_type, data } = payload;

    switch (event_type) {
      case 'contact.updated':
        log.info(`[CRM Webhook] Contact updated: ${data?.email || 'unknown'}`);
        break;
      case 'deal.created':
        log.info(`[CRM Webhook] Deal created: ${data?.name || 'unknown'}`);
        break;
      case 'deal.won':
        log.info(`[CRM Webhook] Deal won: ${data?.name || 'unknown'} — ${data?.value || 'N/A'}`);
        break;
      default:
        log.info(`[CRM Webhook] Event: ${event_type}`);
    }

    event.status = 'processed';
    event.processed_at = new Date().toISOString();
    return { processed: true, event_type };
  } catch (err) {
    event.status = 'failed';
    event.error = err.message;
    throw err;
  }
}

/**
 * Process a custom/n8n/Zapier webhook.
 */
export async function processCustomWebhook(payload) {
  const event = logWebhookEvent('custom', payload.action || 'trigger', payload);

  try {
    const { action, data } = payload;

    switch (action) {
      case 'trigger_outreach':
        log.info(`[Custom Webhook] Trigger outreach for: ${data?.email || 'unknown'}`);
        break;
      case 'add_prospect':
        log.info(`[Custom Webhook] Add prospect: ${data?.email || 'unknown'}`);
        break;
      case 'update_stage':
        log.info(`[Custom Webhook] Update stage for ${data?.email || 'unknown'} to ${data?.stage || 'unknown'}`);
        break;
      default:
        log.info(`[Custom Webhook] Action: ${action}`);
    }

    event.status = 'processed';
    event.processed_at = new Date().toISOString();
    return { processed: true, action };
  } catch (err) {
    event.status = 'failed';
    event.error = err.message;
    throw err;
  }
}

/**
 * Verify webhook signature for security.
 * WARNING: This function is defined but NOT CALLED by any production webhook route.
 * 
 * The production webhook routes use provider-specific verification:
 * - Resend: verifyResendWebhook() in communications.webhooks.js
 * - Cal.com: Not yet implemented (requires configuration)
 * - n8n/Zapier: Not yet implemented (requires configuration)
 * 
 * Provider signatures must be configured in environment variables:
 * - COMMUNICATION_RESEND_WEBHOOK_SECRET (Resend, for email delivery events)
 * 
 * If a provider's signing format cannot be safely determined,
 * the webhook handler should throw an error or return 403.
 * 
 * This function is a fallback that fails closed when secrets are configured:
 * - No secret configured → returns true (development mode)
 * - Secret configured but no signature → returns false
 * - Invalid signature → returns false
 */
export function verifySignature(payload, signature, secret) {
  // No secret configured → graceful degradation (development mode only)
  if (!secret) return true;
  
  // Secret configured but no signature → fail closed
  if (!signature) return false;
  
  // Try Resend signature format first (v1,<base64>)
  if (signature.startsWith('v1,')) {
    const signatureValue = signature.slice(3).trim();
    if (!signatureValue || !/^[a-zA-Z0-9+/=]+$/.test(signatureValue)) return false;
    
    // Resend uses: timestamp.id.rawBody
    // NOTE: This simplified implementation verifies against raw payload only.
    // For production, use verifyResendWebhook() in communications.webhooks.js
    // which correctly includes timestamp and id in the signature calculation.
    const key = parseSigningSecret(secret);
    if (!key) return false;
    
    const expected = createHmac('sha256', key).update(payload).digest('base64');
    return safeEqual(signatureValue, expected);
  }
  
  // Generic HMAC-SHA256 (hex format)
  if (/^[a-fA-F0-9]{64}$/.test(signature)) {
    const key = parseSigningSecret(secret);
    if (!key) return false;
    
    const expected = createHmac('sha256', key).update(payload).digest('hex');
    return safeEqual(signature, expected);
  }
  
  // Unknown signature format
  return false;
}

/**
 * Parse a Resend-style webhook secret (whsec_<base64>) or raw base64 secret.
 */
export function parseSigningSecret(secret) {
  if (!secret) return null;
  
  // Resend uses 'whsec_' prefix with base64 payload
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  if (!raw) return null;
  
  try {
    // Use standard base64 decoding which handles missing padding gracefully
    const key = Buffer.from(raw, 'base64');
    return key.length ? key : null;
  } catch {
    // Invalid base64 (non-base64 chars, etc.)
    return null;
  }
}

/**
 * Compare two buffers in constant time to prevent timing attacks.
 */
function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Get webhook event history.
 */
export function getEventHistory(limit = 50, source = null) {
  let events = [...webhookLog];
  if (source) events = events.filter((e) => e.source === source);
  return events.slice(-limit).reverse(); // Most recent first
}

// ---- Helpers ----

function logWebhookEvent(source, eventType, payload) {
  const event = {
    id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source,
    event_type: eventType,
    payload,
    status: 'received',
    error: null,
    processed_at: null,
    created_at: new Date().toISOString(),
  };
  webhookLog.push(event);

  // Keep log manageable
  if (webhookLog.length > 1000) webhookLog.splice(0, 500);

  log.info(`[Webhook] ${source}/${eventType} received`);
  return event;
}

function extractEmail(from) {
  if (!from) return null;
  // Handle formats: "Name <email>" or just "email"
  const match = from.match(/<([^>]+)>/) || from.match(/([^\s<>]+@[^\s<>]+)/);
  return match ? match[1].toLowerCase() : null;
}

async function findProspectByEmail(email) {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) {
    return mem.prospects.find((p) => p.email?.toLowerCase() === email.toLowerCase()) || null;
  }
  const { data } = await db.from('prospects').select('*').eq('email', email.toLowerCase()).maybeSingle();
  return data;
}

async function findClientById(clientId) {
  const { client: db, usingMemory } = getDb();
  if (usingMemory) {
    return mem.clients.find((c) => c.id === clientId) || null;
  }
  const { data } = await db.from('clients').select('*').eq('id', clientId).maybeSingle();
  return data;
}
