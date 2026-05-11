import { z } from 'zod';
import { config } from '../config.js';
import type { ToolContext } from './context.js';

export const getRestaurantInfoSchema = z.object({}).passthrough();

export type GetRestaurantInfoArgs = z.infer<typeof getRestaurantInfoSchema>;

export async function getRestaurantInfo(
  _args: GetRestaurantInfoArgs,
  _ctx: ToolContext,
): Promise<string> {
  const r = config.restaurant;
  // TODO: replace with real address once known.
  const address = '123 Main St';
  return [
    `${r.name} is located at ${address}.`,
    `Open ${formatHour(r.openHour)} to ${formatHour(r.closeHour)} (last seating), ${r.timezone}.`,
    `We seat parties up to ${r.maxPartySize}.`,
  ].join(' ');
}

function formatHour(h: number): string {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${period}`;
}
