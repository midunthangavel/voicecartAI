import { z } from 'zod';

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'pending',
    'confirmed',
    'preparing',
    'ready',
    'dispatched',
    'delivered',
    'cancelled',
  ]),
}).strict();

export const flagDisputeSchema = z.object({
  reason: z.string().trim().min(3, 'Dispute reason must be at least 3 characters').max(500),
}).strict();

export const resolveDisputeSchema = z.object({
  resolution: z.enum(['refund', 'reject']),
  notes: z.string().trim().max(500).optional().default(''),
}).strict();
