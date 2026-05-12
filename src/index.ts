import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { authRouter } from './routes/auth.js';
import { toolsRouter } from './routes/tools.js';
import { adminRouter } from './routes/admin.js';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use((req, _res, next) => {
  logger.debug({ method: req.method, path: req.path }, 'http');
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetHtmlPath = resolve(__dirname, '../public/index.html');
const widgetHtmlTemplate = readFileSync(widgetHtmlPath, 'utf8');

app.get('/', (_req, res) => {
  const html = widgetHtmlTemplate
    .replaceAll('__RESTAURANT_NAME__', escapeHtml(config.restaurant.name))
    .replaceAll('__VAPI_PUBLIC_KEY__', escapeHtml(config.vapi.publicKey ?? ''))
    .replaceAll('__VAPI_ASSISTANT_ID__', escapeHtml(config.vapi.assistantId ?? ''));
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.send(html);
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}

app.use(authRouter);
app.use(toolsRouter);
app.use(adminRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error({ err: msg }, 'Unhandled error');
  res.status(500).json({ error: 'Internal error' });
});

app.listen(config.port, () => {
  logger.info(
    { port: config.port, env: config.nodeEnv, restaurant: config.restaurant.id },
    `Listening on ${config.publicBaseUrl}`,
  );
});
