import { Router, type Request, type Response } from 'express';
import { config } from '../config.js';
import { exchangeCodeAndStore, getAuthUrl } from '../services/google-auth.js';
import { logger } from '../lib/logger.js';

export const authRouter = Router();

authRouter.get('/auth/google', (_req: Request, res: Response) => {
  const url = getAuthUrl();
  res.redirect(url);
});

authRouter.get('/auth/google/callback', async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined;

  if (oauthError) {
    res.status(400).send(renderHtml('Google OAuth error', `Google returned an error: ${escape(oauthError)}`));
    return;
  }
  if (!code) {
    res.status(400).send(renderHtml('Missing code', 'No authorization code present in callback URL.'));
    return;
  }

  try {
    await exchangeCodeAndStore(code);
    res.send(
      renderHtml(
        'Google Calendar connected',
        `Tokens stored for restaurant <code>${escape(config.restaurant.id)}</code>. You can close this tab.`,
      ),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'OAuth callback failed');
    res.status(500).send(renderHtml('OAuth failed', escape(msg)));
  }
});

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

function renderHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:42rem;margin:4rem auto;padding:0 1rem;color:#222}
h1{font-size:1.4rem}code{background:#f3f3f3;padding:.1rem .3rem;border-radius:.2rem}</style>
</head><body><h1>${escape(title)}</h1><p>${body}</p></body></html>`;
}
