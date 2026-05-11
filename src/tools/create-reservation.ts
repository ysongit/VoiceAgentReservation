import { z } from 'zod';
import { addMinutes } from 'date-fns';
import { config } from '../config.js';
import { formatForSpeech, isWithinOpenHours, parseLocal } from '../lib/datetime.js';
import { createEvent, isSlotFree } from '../services/google-calendar.js';
import { generateConfirmationCode, type ToolContext } from './context.js';

export const createReservationSchema = z.object({
  customer_name: z.string().min(1),
  party_size: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export type CreateReservationArgs = z.infer<typeof createReservationSchema>;

export async function createReservation(
  args: CreateReservationArgs,
  ctx: ToolContext,
): Promise<string> {
  const { maxPartySize, openHour, closeHour, reservationDurationMin } = config.restaurant;

  if (args.party_size > maxPartySize) {
    return `Sorry, our maximum party size is ${maxPartySize}. I can't book ${args.party_size}.`;
  }

  const start = parseLocal(args.date, args.time, ctx.tz);
  const end = addMinutes(start, reservationDurationMin);

  if (!isWithinOpenHours(start, ctx.tz, openHour, closeHour)) {
    return `That time is outside our hours. We're open ${openHour}:00 to ${closeHour}:00.`;
  }

  const free = await isSlotFree(ctx.calendar, ctx.calendarId, start, end);
  if (!free) {
    return `Sorry, that time was just taken. Would you like to try another slot?`;
  }

  const code = await insertWithUniqueCode(ctx, args, start);

  const eventId = await createEvent(ctx.calendar, ctx.calendarId, {
    summary: `Reservation: ${args.customer_name} (party of ${args.party_size}) — ${code}`,
    description: buildDescription(args, code),
    startUtc: start,
    endUtc: end,
    timezone: ctx.tz,
  });

  const { error: updateErr } = await ctx.supabase
    .from('reservations')
    .update({ calendar_event_id: eventId, updated_at: new Date().toISOString() })
    .eq('confirmation_code', code);
  if (updateErr) {
    ctx.logger.warn({ err: updateErr.message, code, eventId }, 'Failed to attach event id to reservation');
  }

  return `Booked. Confirmation code ${code}. ${args.customer_name}, party of ${args.party_size}, ${formatForSpeech(start, ctx.tz)}.`;
}

async function insertWithUniqueCode(
  ctx: ToolContext,
  args: CreateReservationArgs,
  startUtc: Date,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateConfirmationCode();
    const { error } = await ctx.supabase.from('reservations').insert({
      restaurant_id: ctx.restaurantId,
      confirmation_code: code,
      customer_name: args.customer_name,
      customer_phone: args.phone ?? null,
      party_size: args.party_size,
      reservation_at: startUtc.toISOString(),
      notes: args.notes ?? null,
      status: 'confirmed',
    });
    if (!error) return code;
    // 23505 = unique_violation; retry on collision
    if (error.code !== '23505') {
      throw new Error(`Failed to insert reservation: ${error.message}`);
    }
  }
  throw new Error('Could not generate a unique confirmation code after 5 attempts');
}

function buildDescription(args: CreateReservationArgs, code: string): string {
  const parts: string[] = [
    `Confirmation: ${code}`,
    `Party size: ${args.party_size}`,
  ];
  if (args.phone) parts.push(`Phone: ${args.phone}`);
  if (args.notes) parts.push(`Notes: ${args.notes}`);
  return parts.join('\n');
}
