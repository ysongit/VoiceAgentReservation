import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export const supabase: SupabaseClient = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

export type Db = typeof supabase;
