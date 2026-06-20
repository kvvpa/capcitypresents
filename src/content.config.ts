import { defineCollection, z } from 'astro:content';

const dateString = z.preprocess((value) => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}, z.string());

const events = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: dateString,
    doorsTime: z.string().optional(),
    showTime: z.string().optional(),
    venue: z.string(),
    city: z.string().default('Olympia, WA'),
    ageRestriction: z.string().optional(),
    price: z.string().optional(),
    ticketUrl: z.string().url().optional().or(z.literal('')),
    facebookEventUrl: z.string().url().optional().or(z.literal('')),
    poster: z.string().optional(),
    posterSource: z.enum(['manual', 'purplepass', 'facebook', 'unknown']).optional(),
    alternateImages: z.array(z.object({
      path: z.string(),
      source: z.enum(['manual', 'purplepass', 'facebook', 'unknown']),
      width: z.number().optional(),
      height: z.number().optional(),
      kind: z.enum(['flyer', 'platform-graphic', 'photo', 'unknown']).default('unknown'),
    })).default([]),
    imageLocked: z.boolean().default(false),
    lockedFields: z.array(z.string()).default([]),
    syncId: z.string().optional(),
    status: z.enum(['announced', 'sold-out', 'cancelled', 'past']).default('announced'),
    featured: z.boolean().default(false),
  }),
});

export const collections = { events };
