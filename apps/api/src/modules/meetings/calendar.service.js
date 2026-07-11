// Calendar Service
// Integration with Cal.com for automated meeting booking.
// Handles availability checks, booking creation, and webhook processing.

import { config } from '../../config/config.js';
import { log } from '../../utils/logger.js';
import { updateProspect, insertEvent } from '../../database/db.js';
import { alertEvent } from '../../integrations/notifications.js';

const CALCOM_API = config.calcomBaseUrl || 'https://api.cal.com';

function calcomHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.calcomApiKey}`,
  };
}

/**
 * Get available time slots from Cal.com.
 * @param {string} startDate  ISO date string (YYYY-MM-DD)
 * @param {string} endDate    ISO date string (YYYY-MM-DD)
 */
export async function getAvailability(startDate, endDate) {
  if (!config.calcomApiKey || config.dryRun) {
    log.dry('[Calendar] Would fetch availability');
    // Return mock availability for dry-run
    return generateMockSlots(startDate, endDate);
  }

  try {
    const url = `${CALCOM_API}/v1/availability?startTime=${startDate}&endTime=${endDate}&eventTypeId=${config.calcomEventTypeId}`;
    const res = await fetch(url, { headers: calcomHeaders() });
    if (!res.ok) throw new Error(`Cal.com API ${res.status}`);
    const data = await res.json();
    return data.slots || [];
  } catch (err) {
    log.error(`Calendar availability check failed: ${err.message}`);
    return generateMockSlots(startDate, endDate);
  }
}

/**
 * Create a booking via Cal.com API.
 * @param {object} prospect  The prospect to book
 * @param {string} slot      ISO datetime of the selected slot
 */
export async function bookMeeting(prospect, slot) {
  if (!config.calcomApiKey || config.dryRun) {
    log.dry(`[Calendar] Would book meeting for ${prospect.full_name} at ${slot}`);
    return {
      status: 'dry_run',
      bookingId: `mock-booking-${Date.now()}`,
      slot,
      prospect: prospect.email,
    };
  }

  try {
    const res = await fetch(`${CALCOM_API}/v1/bookings`, {
      method: 'POST',
      headers: calcomHeaders(),
      body: JSON.stringify({
        eventTypeId: config.calcomEventTypeId,
        start: slot,
        responses: {
          name: prospect.full_name,
          email: prospect.email,
          notes: `Company: ${prospect.company || 'N/A'}\nTitle: ${prospect.title || 'N/A'}\nICP Score: ${prospect.icp_score || 'N/A'}`,
        },
        timeZone: config.schedulerTimezone,
        language: 'en',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cal.com booking failed: ${res.status} — ${text}`);
    }

    const data = await res.json();

    // Update prospect stage
    await updateProspect(prospect.id, { stage: 'booked', next_action_at: null });
    await insertEvent({
      prospect_id: prospect.id,
      type: 'reply',
      meta: { intent: 'booked', bookingId: data.id, slot },
    });

    // Send alert
    await alertEvent('meeting_booked', {
      name: prospect.full_name,
      title: prospect.title,
      company: prospect.company,
      time: new Date(slot).toLocaleString(),
      client: 'N/A',
    });

    log.ok(`Meeting booked with ${prospect.email} at ${slot} 🎉`);
    return { status: 'booked', bookingId: data.id, slot, prospect: prospect.email };
  } catch (err) {
    log.error(`Booking failed for ${prospect.email}: ${err.message}`);
    return { status: 'failed', error: err.message };
  }
}

/**
 * Generate and send a booking link to a prospect.
 */
export async function sendBookingLink(prospect) {
  const bookingUrl = config.calcomBookingUrl;
  return {
    bookingUrl,
    prospect: prospect.email,
    message: `Book a call here: ${bookingUrl}`,
  };
}

/**
 * Process a Cal.com webhook event (meeting created, cancelled, etc).
 */
export async function handleBookingWebhook(event) {
  const { triggerEvent, payload } = event;

  switch (triggerEvent) {
    case 'BOOKING_CREATED': {
      const attendeeEmail = payload?.attendees?.[0]?.email;
      if (attendeeEmail) {
        log.ok(`[Calendar webhook] Meeting booked by ${attendeeEmail}`);
        // In a full implementation, find the prospect by email and update their stage
      }
      return { processed: true, event: 'BOOKING_CREATED', email: attendeeEmail };
    }

    case 'BOOKING_CANCELLED': {
      const attendeeEmail = payload?.attendees?.[0]?.email;
      log.info(`[Calendar webhook] Meeting cancelled by ${attendeeEmail}`);
      return { processed: true, event: 'BOOKING_CANCELLED', email: attendeeEmail };
    }

    case 'BOOKING_RESCHEDULED': {
      const attendeeEmail = payload?.attendees?.[0]?.email;
      log.info(`[Calendar webhook] Meeting rescheduled by ${attendeeEmail}`);
      return { processed: true, event: 'BOOKING_RESCHEDULED', email: attendeeEmail };
    }

    default:
      log.info(`[Calendar webhook] Unhandled event: ${triggerEvent}`);
      return { processed: false, event: triggerEvent };
  }
}

// Generate mock available slots for dry-run testing
function generateMockSlots(startDate, endDate) {
  const slots = [];
  const start = new Date(startDate || Date.now());
  const end = new Date(endDate || Date.now() + 7 * 86400000);

  const current = new Date(start);
  while (current <= end) {
    // Skip weekends
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      for (const hour of [10, 11, 14, 15, 16]) {
        const slot = new Date(current);
        slot.setHours(hour, 0, 0, 0);
        slots.push({
          time: slot.toISOString(),
          duration: 30,
          available: true,
        });
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return slots;
}
