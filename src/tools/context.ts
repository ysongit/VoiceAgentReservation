import type { calendar_v3 } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from 'pino';

export interface ToolContext {
  restaurantId: string;
  tz: string;
  calendar: calendar_v3.Calendar;
  calendarId: string;
  supabase: SupabaseClient;
  logger: Logger;
}

/** 6-char uppercase alphanumeric, excluding ambiguous chars (0/O, 1/I). */
export function generateConfirmationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
