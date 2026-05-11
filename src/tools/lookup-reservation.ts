import { z } from 'zod';
import { formatForSpeech } from '../lib/datetime.js';
import type { ToolContext } from './context.js';

export const lookupReservationSchema = z
  .object({
    confirmation_code: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((v) => Boolean(v.confirmation_code || v.phone), {
    message: 'Provide confirmation_code or phone',
  });

export type LookupReservationArgs = z.infer<typeof lookupReservationSchema>;

interface ReservationRow {
  confirmation_code: string;
  customer_name: string;
  party_size: number;
  reservation_at: string;
  status: string;
  customer_phone: string | null;
}

export async function lookupReservation(
  args: LookupReservationArgs,
  ctx: ToolContext,
): Promise<string> {
  let query = ctx.supabase
    .from('reservations')
    .select('confirmation_code, customer_name, party_size, reservation_at, status, customer_phone')
    .eq('restaurant_id', ctx.restaurantId)
    .order('reservation_at', { ascending: false })
    .limit(1);

  if (args.confirmation_code) {
    query = query.eq('confirmation_code', args.confirmation_code.toUpperCase());
  } else if (args.phone) {
    query = query.eq('customer_phone', args.phone);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Lookup failed: ${error.message}`);

  const row = (data?.[0] as ReservationRow | undefined) ?? undefined;
  if (!row) {
    return args.confirmation_code
      ? `No reservation found for code ${args.confirmation_code.toUpperCase()}.`
      : `No reservation found for that phone number.`;
  }

  const when = formatForSpeech(new Date(row.reservation_at), ctx.tz);
  if (row.status === 'cancelled') {
    return `Reservation ${row.confirmation_code} for ${row.customer_name} on ${when} was cancelled.`;
  }
  return `Reservation ${row.confirmation_code}: ${row.customer_name}, party of ${row.party_size}, ${when}.`;
}
