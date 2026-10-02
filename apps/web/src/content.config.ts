import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

/** YAML turns an unquoted `2026-10-02` into a Date; keep it as the plain ISO day string. */
const isoDay = z.preprocess(
  (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD'),
);

/** Review state of a translated (DE) page — see docs/AUTHORING.md "Translation review". */
const translationFields = z.object({
  status: z.enum(['ai-reviewed', 'human-reviewed']),
  reviewedAt: isoDay,
  reviewer: z.string().optional(),
});

/** Lesson metadata (docs/PLAN.md lessonSchema). All optional during M0. */
const lessonFields = z.object({
  lessonId: z.string().optional(),
  track: z.string().optional(),
  phase: z.number().int().nonnegative().optional(),
  prereqs: z.array(z.string()).optional(),
  labs: z.array(z.string()).optional(),
  refs: z.array(z.string()).optional(),
  sourceHash: z.string().optional(),
  translation: translationFields.optional(),
});

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema({ extend: lessonFields }) }),
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
