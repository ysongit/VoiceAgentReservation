import type { calendar_v3 } from 'googleapis';
import { toZonedIso } from '../lib/datetime.js';

/**
 * Returns true if the given window is entirely free on the calendar.
 * A single freebusy hit anywhere in [startUtc, endUtc) means unavailable.
 */
export async function isSlotFree(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  startUtc: Date,
  endUtc: Date,
): Promise<boolean> {
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: startUtc.toISOString(),
      timeMax: endUtc.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const cal = res.data.calendars?.[calendarId];
  if (cal?.errors && cal.errors.length > 0) {
    throw new Error(`freebusy error for ${calendarId}: ${cal.errors.map((e) => e.reason).join(', ')}`);
  }
  const busy = cal?.busy ?? [];
  return busy.length === 0;
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  startUtc: Date;
  endUtc: Date;
  timezone: string;
}

/** Create an event with timezone-qualified start/end. Returns the created event id. */
export async function createEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  input: CreateEventInput,
): Promise<string> {
  const res = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: { dateTime: toZonedIso(input.startUtc, input.timezone), timeZone: input.timezone },
      end: { dateTime: toZonedIso(input.endUtc, input.timezone), timeZone: input.timezone },
    },
  });
  const id = res.data.id;
  if (!id) throw new Error('Calendar event insert returned no id');
  return id;
}

/** Delete an event by id. Treats 404/410 as already-gone (idempotent). */
export async function deleteEvent(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
): Promise<void> {
  try {
    await calendar.events.delete({ calendarId, eventId });
  } catch (err) {
    const status = (err as { code?: number; status?: number }).code
      ?? (err as { code?: number; status?: number }).status;
    if (status === 404 || status === 410) return;
    throw err;
  }
}
