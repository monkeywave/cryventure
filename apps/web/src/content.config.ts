import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

/** Lesson metadata (docs/PLAN.md lessonSchema). All optional during M0. */
const lessonFields = z.object({
  lessonId: z.string().optional(),
  track: z.string().optional(),
  phase: z.number().int().nonnegative().optional(),
  prereqs: z.array(z.string()).optional(),
  labs: z.array(z.string()).optional(),
  refs: z.array(z.string()).optional(),
  sourceHash: z.string().optional(),
});

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: lessonFields }) }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
