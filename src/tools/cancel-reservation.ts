import { z } from 'zod';
import { deleteEvent } from '../services/google-calendar.js';
import type { ToolContext } from './context.js';

export const cancelReservationSchema = z.object({
  confirmation_code: z.string().min(1),
});

export type CancelReservationArgs = z.infer<typeof cancelReservationSchema>;

interface ReservationRow {
  id: string;
  confirmation_code: string;
  status: string;
  calendar_event_id: string | null;
}

export async function cancelReservation(
  args: CancelReservationArgs,
  ctx: ToolContext,
): Promise<string> {
  const code = args.confirmation_code.toUpperCase();

  const { data, error } = await ctx.supabase
    .from('reservations')
    .select('id, confirmation_code, status, calendar_event_id')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('confirmation_code', code)
    .limit(1);

  if (error) throw new Error(`Cancel lookup failed: ${error.message}`);
  const row = (data?.[0] as ReservationRow | undefined) ?? undefined;
  if (!row) return `No reservation found for code ${code}.`;
  if (row.status === 'cancelled') return `Reservation ${code} was already cancelled.`;

  if (row.calendar_event_id) {
    try {
      await deleteEvent(ctx.calendar, ctx.calendarId, row.calendar_event_id);
    } catch (err) {
      ctx.logger.warn(
        { err: err instanceof Error ? err.message : String(err), code, eventId: row.calendar_event_id },
        'Calendar event delete failed; continuing to mark reservation cancelled',
      );
    }
  }

  const { error: updateErr } = await ctx.supabase
    .from('reservations')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (updateErr) throw new Error(`Failed to mark reservation cancelled: ${updateErr.message}`);

  return `Cancelled reservation ${code}.`;
}
