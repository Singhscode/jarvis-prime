// Calendar API Route
// Meeting booking, availability checks, and Cal.com webhook processing.

import express from 'express';
import { providerStatus } from '../../config.js';
import * as calendarService from '../services/calendar-service.js';

const router = express.Router();

// GET /api/calendar/availability — Available time slots
router.get('/availability', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const slots = await calendarService.getAvailability(startDate, endDate);
    return res.json({ success: true, data: { slots, count: slots.length } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/calendar/book — Book a meeting
router.post('/book', async (req, res) => {
  try {
    const { prospect, slot } = req.body;
    if (!prospect || !slot) {
      return res.status(400).json({ error: 'Missing prospect or slot' });
    }
    const result = await calendarService.bookMeeting(prospect, slot);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/calendar/send-link — Send booking link to a prospect
router.post('/send-link', async (req, res) => {
  try {
    const { prospect } = req.body;
    if (!prospect) return res.status(400).json({ error: 'Missing prospect' });
    const result = await calendarService.sendBookingLink(prospect);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/calendar/webhook — Cal.com webhook receiver (NO AUTH — verified by signature)
router.post('/webhook', async (req, res) => {
  try {
    const result = await calendarService.handleBookingWebhook(req.body);
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/calendar — Status endpoint
router.get('/', (req, res) => {
  const status = providerStatus();
  return res.json({
    status: 'ok',
    configured: status.calcom,
    endpoints: [
      'GET /api/calendar/availability?startDate=&endDate=',
      'POST /api/calendar/book',
      'POST /api/calendar/send-link',
      'POST /api/calendar/webhook',
    ],
  });
});

export default router;
