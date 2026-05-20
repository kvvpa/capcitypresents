import { defineCollection, z } from 'astro:content';

const events = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.string(),
    doorsTime: z.string().optional(),
    showTime: z.string().optional(),
    venue: z.string(),
    city: z.string().default('Olympia, WA'),
    ageRestriction: z.string().optional(),
    price: z.string().optional(),
    ticketUrl: z.string().url().optional().or(z.literal('')),
    facebookEventUrl: z.string().url().optional().or(z.literal('')),
    poster: z.string().optional(),
    status: z.enum(['announced', 'sold-out', 'cancelled', 'past']).default('announced'),
    featured: z.boolean().default(false),
  }),
});

export const collections = { events };
