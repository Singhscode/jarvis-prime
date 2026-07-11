// Event bus — lightweight publish/subscribe for internal domain events.
//
// Decouples modules so adding new side-effects (notifications, analytics, CRM sync)
// doesn't require editing the publisher module.
//
// Events:
//   prospect.created    — A new prospect was sourced and saved
//   prospect.qualified  — A prospect passed ICP scoring
//   email.sent          — An email was sent (or dry-run simulated)
//   reply.received      — An inbound reply was processed
//   meeting.booked      — A meeting was booked
//   campaign.started    — A campaign was activated
//   campaign.completed  — A campaign finished its sequence
//   error.occurred      — An error occurred
//
// Usage:
//   import { eventBus } from './lib/event-bus.js';
//   eventBus.on('email.sent', async (data) => { ... });
//   eventBus.emit('email.sent', { prospectId, subject, status });

import { log } from 'jarvis-logger';

class EventBus {
  constructor() {
    this._listeners = new Map();
    this._history = [];        // Recent event history for debugging
    this._maxHistory = 500;
  }

  /**
   * Subscribe to an event.
   * @param {string} event      Event name (e.g., 'email.sent')
   * @param {Function} handler  Async handler function (data) => void
   * @param {object} [opts]     { once: boolean, priority: number }
   * @returns {Function} Unsubscribe function
   */
  on(event, handler, opts = {}) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }

    const entry = { handler, once: opts.once || false, priority: opts.priority || 0 };
    this._listeners.get(event).push(entry);

    // Sort by priority (higher first)
    this._listeners.get(event).sort((a, b) => b.priority - a.priority);

    // Return unsubscribe function
    return () => {
      const listeners = this._listeners.get(event);
      if (listeners) {
        const idx = listeners.indexOf(entry);
        if (idx !== -1) listeners.splice(idx, 1);
      }
    };
  }

  /**
   * Subscribe to an event, but only fire once.
   */
  once(event, handler) {
    return this.on(event, handler, { once: true });
  }

  /**
   * Emit an event to all subscribers.
   * Handlers are called in priority order. Errors in one handler don't prevent others from running.
   * @param {string} event  Event name
   * @param {object} data   Event data
   */
  async emit(event, data = {}) {
    // Record in history
    this._history.push({
      event,
      data,
      timestamp: new Date().toISOString(),
    });

    // Trim history
    if (this._history.length > this._maxHistory) {
      this._history = this._history.slice(-this._maxHistory);
    }

    const listeners = this._listeners.get(event);
    if (!listeners || listeners.length === 0) return;

    const toRemove = [];

    for (const entry of listeners) {
      try {
        await entry.handler(data);
      } catch (err) {
        log.error(`[EventBus] Handler error for "${event}": ${err.message}`);
      }

      if (entry.once) {
        toRemove.push(entry);
      }
    }

    // Remove once-handlers
    for (const entry of toRemove) {
      const idx = listeners.indexOf(entry);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  /**
   * Remove all listeners for an event, or all listeners entirely.
   */
  removeAll(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event.
   */
  listenerCount(event) {
    return this._listeners.get(event)?.length || 0;
  }

  /**
   * Get registered event names.
   */
  eventNames() {
    return Array.from(this._listeners.keys());
  }

  /**
   * Get recent event history (for debugging / admin dashboard).
   */
  getHistory(limit = 50, event = null) {
    let history = [...this._history];
    if (event) history = history.filter((h) => h.event === event);
    return history.slice(-limit).reverse();
  }
}

// Singleton instance
export const eventBus = new EventBus();
