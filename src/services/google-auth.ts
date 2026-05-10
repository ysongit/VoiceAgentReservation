import { google, type calendar_v3 } from 'googleapis';
import { config } from '../config.js';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

interface OAuthTokenRow {
  restaurant_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO
  calendar_id: string;
  scope: string;
}

function newOAuthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri,
  );
}

/** Build the consent-screen URL. */
export function getAuthUrl(state?: string): string {
  const client = newOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...config.google.scopes],
    state,
  });
}

/** Exchange the authorization code and persist tokens for the configured restaurant. */
export async function exchangeCodeAndStore(code: string): Promise<void> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);

  if (!tokens.access_token) throw new Error('Google did not return an access_token.');
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token. Revoke prior access at myaccount.google.com/permissions and retry.',
    );
  }

  const expiresAt = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const row = {
    restaurant_id: config.restaurant.id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    calendar_id: 'primary',
    scope: tokens.scope ?? config.google.scopes.join(' '),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('oauth_tokens').upsert(row, { onConflict: 'restaurant_id' });
  if (error) throw new Error(`Failed to upsert oauth_tokens: ${error.message}`);
  logger.info({ restaurantId: config.restaurant.id }, 'Stored Google OAuth tokens');
}

async function loadTokens(restaurantId: string): Promise<OAuthTokenRow> {
  const { data, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .single();
  if (error || !data) {
    throw new Error(
      `No OAuth tokens found for restaurant "${restaurantId}". Complete /auth/google first.`,
    );
  }
  return data as OAuthTokenRow;
}

async function persistRefreshed(
  restaurantId: string,
  accessToken: string,
  expiresAt: string,
): Promise<void> {
  const { error } = await supabase
    .from('oauth_tokens')
    .update({ access_token: accessToken, expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('restaurant_id', restaurantId);
  if (error) logger.warn({ err: error.message }, 'Failed to persist refreshed access token');
}

/**
 * Return an authed Calendar v3 client for the given restaurant.
 * Refreshes the access token if it's within 60s of expiry, and persists the new token.
 */
export async function getAuthedCalendarClient(
  restaurantId: string,
): Promise<{ calendar: calendar_v3.Calendar; calendarId: string }> {
  const row = await loadTokens(restaurantId);
  const client = newOAuthClient();
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: new Date(row.expires_at).getTime(),
    scope: row.scope,
    token_type: 'Bearer',
  });

  const msUntilExpiry = new Date(row.expires_at).getTime() - Date.now();
  if (msUntilExpiry < 60_000) {
    logger.debug({ msUntilExpiry }, 'Refreshing Google access token');
    const { credentials } = await client.refreshAccessToken();
    if (credentials.access_token && credentials.expiry_date) {
      client.setCredentials(credentials);
      await persistRefreshed(
        restaurantId,
        credentials.access_token,
        new Date(credentials.expiry_date).toISOString(),
      );
    }
  }

  // Auto-persist on background refresh events too.
  client.on('tokens', (t: { access_token?: string | null; expiry_date?: number | null }) => {
    if (t.access_token && t.expiry_date) {
      void persistRefreshed(
        restaurantId,
        t.access_token,
        new Date(t.expiry_date).toISOString(),
      );
    }
  });

  const calendar = google.calendar({ version: 'v3', auth: client });
  return { calendar, calendarId: row.calendar_id };
}
