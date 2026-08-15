import { z } from 'zod';

export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'delivered', 'cancelled'], {
    errorMap: () => ({ message: 'Invalid order status' }),
  }),
  expectedVersion: z.number().int().positive({ message: 'expectedVersion must be a positive integer' }).optional(),
  notes: z.string().max(500).optional(),
});

export const flagDisputeSchema = z.object({
  reason: z.string().min(3, 'Dispute reason is required').max(500),
  notes: z.string().max(1000).optional(),
});

export const resolveDisputeSchema = z.object({
  resolutionNotes: z.string().min(3, 'Resolution notes are required').max(1000),
  action: z.enum(['refund', 'reorder', 'dismiss'], {
    errorMap: () => ({ message: 'Resolution action must be refund, reorder, or dismiss' }),
  }),
});
