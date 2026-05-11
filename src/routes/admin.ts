// TODO(v2): add auth — currently open for local dev only

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { supabase } from '../lib/supabase.js';

export const adminRouter = Router();

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

adminRouter.get('/admin/reservations', async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query', details: parsed.error.flatten() });
    return;
  }

  let q = supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', config.restaurant.id)
    .order('reservation_at', { ascending: true });

  if (parsed.data.from) q = q.gte('reservation_at', parsed.data.from);
  if (parsed.data.to) q = q.lte('reservation_at', parsed.data.to);

  const { data, error } = await q;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.json({ reservations: data ?? [] });
});

adminRouter.get('/admin/reservations/:code', async (req: Request, res: Response) => {
  const code = req.params.code?.toUpperCase();
  if (!code) {
    res.status(400).json({ error: 'Missing code' });
    return;
  }
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', config.restaurant.id)
    .eq('confirmation_code', code)
    .maybeSingle();
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  if (!data) {
    res.status(404).json({ error: `No reservation for ${code}` });
    return;
  }
  res.json({ reservation: data });
});
