import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PUBLIC_BASE_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  RESTAURANT_ID: z.string().min(1),
  RESTAURANT_NAME: z.string().min(1),
  RESTAURANT_TIMEZONE: z.string().min(1),
  RESTAURANT_MAX_PARTY_SIZE: z.coerce.number().int().positive(),
  RESTAURANT_OPEN_HOUR: z.coerce.number().int().min(0).max(23),
  RESTAURANT_CLOSE_HOUR: z.coerce.number().int().min(0).max(23),
  RESERVATION_DURATION_MINUTES: z.coerce.number().int().positive(),

  VAPI_WEBHOOK_SECRET: z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  VAPI_PUBLIC_KEY: z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
  VAPI_ASSISTANT_ID: z.string().optional().transform((v) => (v && v.length > 0 ? v : undefined)),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  publicBaseUrl: env.PUBLIC_BASE_URL,
  isDev: env.NODE_ENV === 'development',

  supabase: {
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },

  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  },

  restaurant: {
    id: env.RESTAURANT_ID,
    name: env.RESTAURANT_NAME,
    timezone: env.RESTAURANT_TIMEZONE,
    maxPartySize: env.RESTAURANT_MAX_PARTY_SIZE,
    openHour: env.RESTAURANT_OPEN_HOUR,
    closeHour: env.RESTAURANT_CLOSE_HOUR,
    reservationDurationMin: env.RESERVATION_DURATION_MINUTES,
  },

  vapi: {
    webhookSecret: env.VAPI_WEBHOOK_SECRET,
    publicKey: env.VAPI_PUBLIC_KEY,
    assistantId: env.VAPI_ASSISTANT_ID,
  },
} as const;

export type Config = typeof config;
