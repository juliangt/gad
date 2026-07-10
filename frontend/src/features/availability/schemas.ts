import { z } from 'zod';

const activityEnum = z.enum(['coffee', 'drinks', 'food', 'walk', 'park', 'event', 'other']);

export const availabilitySchema = z.object({
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  radius_m: z.number().int().min(100).max(50000).optional(),
  activity_filter: z.array(activityEnum).nullish(),
  window_minutes: z.number().int().min(15).max(1440).optional(),
});

export type AvailabilityValues = z.infer<typeof availabilitySchema>;
