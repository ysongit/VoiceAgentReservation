import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import { supabase } from '../lib/supabase.js';
import { getAuthedCalendarClient } from '../services/google-auth.js';
import {
  checkAvailability,
  checkAvailabilitySchema,
} from '../tools/check-availability.js';
import {
  createReservation,
  createReservationSchema,
} from '../tools/create-reservation.js';
import {
  lookupReservation,
  lookupReservationSchema,
} from '../tools/lookup-reservation.js';
import {
  cancelReservation,
  cancelReservationSchema,
} from '../tools/cancel-reservation.js';
import {
  getRestaurantInfo,
  getRestaurantInfoSchema,
} from '../tools/get-restaurant-info.js';
import type { ToolContext } from '../tools/context.js';

export const toolsRouter = Router();

const toolCallSchema = z.object({
  id: z.string(),
  function: z.object({
    name: z.string(),
    // Vapi may send arguments as a JSON string OR an object.
    arguments: z.union([z.string(), z.record(z.unknown())]).optional(),
  }),
});

const vapiWebhookSchema = z.object({
  message: z.object({
    type: z.string().optional(),
    toolCallList: z.array(toolCallSchema).optional(),
    // Some Vapi versions use toolCalls instead.
    toolCalls: z.array(toolCallSchema).optional(),
  }),
});

type ToolHandler = (args: unknown, ctx: ToolContext) => Promise<string>;

const handlers: Record<string, { schema: z.ZodTypeAny; run: ToolHandler }> = {
  check_availability: {
    schema: checkAvailabilitySchema,
    run: (args, ctx) => checkAvailability(args as never, ctx),
  },
  create_reservation: {
    schema: createReservationSchema,
    run: (args, ctx) => createReservation(args as never, ctx),
  },
  lookup_reservation: {
    schema: lookupReservationSchema,
    run: (args, ctx) => lookupReservation(args as never, ctx),
  },
  cancel_reservation: {
    schema: cancelReservationSchema,
    run: (args, ctx) => cancelReservation(args as never, ctx),
  },
  get_restaurant_info: {
    schema: getRestaurantInfoSchema,
    run: (args, ctx) => getRestaurantInfo(args as never, ctx),
  },
};

toolsRouter.post('/vapi/tools', async (req: Request, res: Response) => {
  // Optional shared-secret check.
  if (config.vapi.webhookSecret) {
    const got = req.header('x-vapi-secret');
    if (got !== config.vapi.webhookSecret) {
      res.status(401).json({ error: 'Invalid webhook secret' });
      return;
    }
  }

  const parsed = vapiWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ err: parsed.error.flatten() }, 'Bad Vapi webhook payload');
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
    return;
  }

  const calls = parsed.data.message.toolCallList ?? parsed.data.message.toolCalls ?? [];
  if (calls.length === 0) {
    res.json({ results: [] });
    return;
  }

  // Build a single tool context (one Google client) for the whole batch.
  let ctx: ToolContext;
  try {
    const { calendar, calendarId } = await getAuthedCalendarClient(config.restaurant.id);
    ctx = {
      restaurantId: config.restaurant.id,
      tz: config.restaurant.timezone,
      calendar,
      calendarId,
      supabase,
      logger,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg }, 'Failed to build tool context');
    res.json({
      results: calls.map((c) => ({
        toolCallId: c.id,
        result: 'The reservation system is not connected to a calendar yet. Please try again later.',
      })),
    });
    return;
  }

  const results = await Promise.all(
    calls.map(async (call) => {
      const result = await runOne(call, ctx);
      return { toolCallId: call.id, result };
    }),
  );

  res.json({ results });
});

async function runOne(
  call: z.infer<typeof toolCallSchema>,
  ctx: ToolContext,
): Promise<string> {
  const name = call.function.name;
  const handler = handlers[name];
  if (!handler) {
    logger.warn({ name }, 'Unknown tool call');
    return `Unknown tool "${name}".`;
  }

  let args: unknown = call.function.arguments ?? {};
  if (typeof args === 'string') {
    try {
      args = args.length === 0 ? {} : JSON.parse(args);
    } catch {
      logger.warn({ name, raw: call.function.arguments }, 'Tool arguments were not valid JSON');
      return `Error: could not parse arguments for ${name}.`;
    }
  }

  const parsed = handler.schema.safeParse(args);
  if (!parsed.success) {
    logger.warn({ name, err: parsed.error.flatten() }, 'Tool argument validation failed');
    const firstIssue = parsed.error.issues[0];
    const detail = firstIssue ? `${firstIssue.path.join('.')}: ${firstIssue.message}` : 'invalid arguments';
    return `Error: ${detail}.`;
  }

  try {
    return await handler.run(parsed.data, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ name, err: msg }, 'Tool handler threw');
    return `Error: could not ${name.replace(/_/g, ' ')} right now. Please try again.`;
  }
}
