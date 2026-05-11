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
