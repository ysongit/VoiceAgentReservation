import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { config } from '../config.js';
import {
  formatForSpeech,
  formatTimeOnly,
  getNextSlots,
  isWithinOpenHours,
  parseLocal,
} from '../lib/datetime.js';
import { isSlotFree } from '../services/google-calendar.js';
import type { ToolContext } from './context.js';

export const checkAvailabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'time must be HH:MM (24h)'),
  party_size: z.coerce.number().int().positive(),
});

export type CheckAvailabilityArgs = z.infer<typeof checkAvailabilitySchema>;

export async function checkAvailability(
  args: CheckAvailabilityArgs,
  ctx: ToolContext,
): Promise<string> {
  const { maxPartySize, openHour, closeHour, reservationDurationMin } = config.restaurant;

  if (args.party_size > maxPartySize) {
    return `Sorry, our maximum party size is ${maxPartySize}. For parties of ${args.party_size}, please call us directly.`;
  }

  const start = parseLocal(args.date, args.time, ctx.tz);
  const end = addMinutes(start, reservationDurationMin);

  if (!isWithinOpenHours(start, ctx.tz, openHour, closeHour)) {
    return `We're only open from ${formatHour(openHour)} to ${formatHour(closeHour)}. ${formatTimeOnly(start, ctx.tz)} is outside our hours.`;
  }

  const free = await isSlotFree(ctx.calendar, ctx.calendarId, start, end);
  if (free) {
    return `Yes, ${formatForSpeech(start, ctx.tz)} is available for ${args.party_size} ${args.party_size === 1 ? 'person' : 'people'}.`;
  }

  const next = await findNextFreeSlots(start, end, ctx, 2);
  if (next.length === 0) {
    return `That time is taken, and I couldn't find another opening that evening. Would you like to try a different day?`;
  }
  const offered = next.map((d) => formatTimeOnly(d, ctx.tz)).join(' or ');
  return `That slot is taken. Closest available: ${offered}.`;
}

async function findNextFreeSlots(
  start: Date,
  _firstEnd: Date,
  ctx: ToolContext,
  count: number,
): Promise<Date[]> {
  const { openHour, closeHour, reservationDurationMin } = config.restaurant;
  const candidates = getNextSlots(start, ctx.tz, reservationDurationMin, openHour, closeHour, 12);
  const free: Date[] = [];
  for (const c of candidates) {
    const cEnd = addMinutes(c, reservationDurationMin);
    if (await isSlotFree(ctx.calendar, ctx.calendarId, c, cEnd)) {
      free.push(c);
      if (free.length >= count) break;
    }
  }
  return free;
}

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${period}`;
}
