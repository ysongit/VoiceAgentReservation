import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { addMinutes } from 'date-fns';

/**
 * Convert a local wall-clock date+time in a given IANA timezone to a UTC Date.
 * Example: parseLocal('2026-05-15', '19:00', 'America/New_York').
 */
export function parseLocal(date: string, time: string, tz: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format (expected YYYY-MM-DD): ${date}`);
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error(`Invalid time format (expected HH:MM 24h): ${time}`);
  }
  // fromZonedTime interprets the wall-clock string as being in `tz` and returns UTC.
  const utc = fromZonedTime(`${date}T${time}:00`, tz);
  if (Number.isNaN(utc.getTime())) {
    throw new Error(`Could not parse datetime: ${date} ${time} ${tz}`);
  }
  return utc;
}

/**
 * Human-readable speech-friendly rendering, e.g. "7:00 PM on Saturday, May 15".
 */
export function formatForSpeech(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "h:mm a 'on' EEEE, MMMM d");
}

/** Short time only, e.g. "7:00 PM". */
export function formatTimeOnly(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, 'h:mm a');
}

/** ISO with timezone offset, suitable for Google Calendar event start/end. */
export function toZonedIso(date: Date, tz: string): string {
  return formatInTimeZone(date, tz, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/** The hour-of-day in `tz` for the given UTC instant. */
export function getHourInTz(date: Date, tz: string): number {
  return Number(formatInTimeZone(date, tz, 'H'));
}

/**
 * Produce up to `count` 30-min-aligned slot starts strictly after `start`,
 * limited to open hours [openHour, closeHour] in `tz`. Each slot must fit
 * a `durationMin` reservation that begins no later than `closeHour`.
 */
export function getNextSlots(
  start: Date,
  tz: string,
  _durationMin: number,
  openHour: number,
  closeHour: number,
  count: number,
): Date[] {
  // Align next candidate to the next :00 or :30 strictly after `start`.
  const startMinutes = Number(formatInTimeZone(start, tz, 'm'));
  const startSeconds = Number(formatInTimeZone(start, tz, 's'));
  let stepMinutes: number;
  if (startSeconds > 0 || startMinutes % 30 !== 0) {
    stepMinutes = 30 - (startMinutes % 30);
  } else {
    stepMinutes = 30;
  }
  let candidate = addMinutes(start, stepMinutes);
  // zero seconds for cleanliness
  candidate = new Date(Math.floor(candidate.getTime() / 1000) * 1000);

  const out: Date[] = [];
  // Safety cap: don't loop forever — at most 48 half-hour steps (24h).
  for (let i = 0; i < 48 && out.length < count; i++) {
    const hour = getHourInTz(candidate, tz);
    if (hour >= openHour && hour <= closeHour) {
      out.push(candidate);
    }
    candidate = addMinutes(candidate, 30);
  }
  return out;
}

/** Returns true if a reservation starting at `start` is within open hours. */
export function isWithinOpenHours(
  start: Date,
  tz: string,
  openHour: number,
  closeHour: number,
): boolean {
  const h = getHourInTz(start, tz);
  return h >= openHour && h <= closeHour;
}
