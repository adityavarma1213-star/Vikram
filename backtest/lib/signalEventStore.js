'use strict';
// Immutable historical signal event store.
//
// ASM and Hidden Gems validation both depend on T0 (detection date) and P0 (detection price)
// never changing after the fact — if later code could "correct" a past event's T0/P0, every
// outcome computed from it becomes unverifiable. This store enforces that at the object level:
// every event is Object.freeze()'d on creation, and the store itself is append-only (no update,
// no delete of an existing event — only a new event with a `requalificationOf` back-reference to
// record that a symbol re-qualified after a broken streak).

function createEvent({ symbol, T0, P0, verdict, detection, universeContext, recognitionState, requalificationOf = null }) {
  if (!symbol || !T0 || P0 == null || !verdict) {
    throw new Error('createEvent requires symbol, T0, P0, and verdict — refusing to create a partial/fabricated event');
  }
  const event = {
    symbol: String(symbol).toUpperCase(),
    T0: String(T0),          // immutable: the exact session this event fired
    P0: Number(P0),          // immutable: the exact close price on T0
    verdict: String(verdict),
    detection: detection ? { ...detection } : null,
    universeContext: universeContext ? [...universeContext] : [],
    recognitionState: recognitionState || 'DATA_INSUFFICIENT',
    eventStatus: 'OPEN',      // OPEN while still qualifying; CLOSED once the streak breaks
    requalificationOf,        // back-reference to a prior event's id, or null if this is a fresh detection
    createdAt: new Date().toISOString()
  };
  return Object.freeze(event);
}

class SignalEventStore {
  constructor() {
    this._events = []; // append-only
  }

  // Records a new, immutable event. Returns its index (used as a stable id for
  // requalificationOf back-references). Never mutates or removes an existing entry.
  append(eventFields) {
    const event = createEvent(eventFields);
    this._events.push(event);
    return this._events.length - 1;
  }

  // "Closing" an event does NOT mutate the frozen T0/P0 record — it appends a new event that
  // carries eventStatus: 'CLOSED' and points back at the original via requalificationOf, so the
  // full history (open -> closed -> re-opened) remains reconstructable and nothing is overwritten.
  close(eventId, closedAt) {
    const original = this._events[eventId];
    if (!original) throw new Error(`No event at id ${eventId}`);
    const closed = Object.freeze({ ...original, eventStatus: 'CLOSED', closedAt: String(closedAt), requalificationOf: eventId });
    this._events.push(closed);
    return this._events.length - 1;
  }

  get(eventId) {
    return this._events[eventId] || null;
  }

  all() {
    return this._events.slice(); // shallow copy — callers cannot mutate the store's own array
  }

  bySymbol(symbol) {
    const sym = String(symbol || '').toUpperCase();
    return this._events.filter(e => e.symbol === sym);
  }
}

module.exports = { SignalEventStore, createEvent };
