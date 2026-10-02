# Authoring lessons

How to write a CryVenture lesson page. Background: `docs/PLAN.md` §3 (design tokens), §4 (lesson
anatomy), §5 (i18n), §6 (curriculum). The AES pages under
`apps/web/src/content/docs/{en,de}/symmetric/aes/` are the reference examples.

## Lesson anatomy

Every lesson has six parts, in this order, each wrapped in `<LessonSection part="…">`:

| # | `part` | Purpose |
|---|---|---|
| 1 | `concept` | The idea in plain words, plus a `<WhyBox>` for every constant |
| 2 | `playground` | The `<Lab>` with a preset taken from the official test vectors |
| 3 | `inside` | The mechanism step by step: worked examples, formulas |
| 4 | `memory` | How it looks in memory and in hardware (link to the track's memory page) |
| 5 | `break` | What breaks if a step or constant is removed (Mallory's quest) |
| 6 | `check` | Three `<CheckQuestion>`s (static until the M2 quiz island) |

`LessonSection` prints the localized "Part n · Name" eyebrow; you write the `##` heading inside it.

Rules:

- **≤ 150 words per section** (not counting formulas, tables and the questions).
- **Cite every claim.** Each fact names its source section, such as "FIPS 197, §5.1.3" or
  "RFC 8439, §2.3". List the sources in the `refs` frontmatter too. Check numbers against the spec's
  worked examples and test vectors. Recompute them if you can.
- Pages with a lab set `tableOfContents: false` so the lab can break out of the content column.
- Leave a blank line after `<LessonSection …>` and before `</LessonSection>`, or MDX will not parse
  the Markdown inside.

## Frontmatter

```yaml
title: Key expansion
description: One sentence for search and social cards.
lessonId: block-ciphers/aes/key-expansion   # stable id, identical in EN and DE
track: block-ciphers
phase: 1
tableOfContents: false
prereqs: [block-ciphers/aes/subbytes-sbox]  # lessonIds
labs: [aes-key-schedule]                    # labIds used on the page
refs:
  - FIPS 197, Section 5.2 (Key Expansion)
sourceHash: sha256:…                        # DE only, see below
```

The schema lives in `apps/web/src/content.config.ts`.

## EN/DE workflow

1. Write the English page first: `apps/web/src/content/docs/en/<path>.mdx`.
2. Create the German page at the same path under `de/`. Keep the structure identical: the same
   components and props, and translated text only. Use the established terms: Runde,
   Rundenschlüssel, Schlüsselexpansion, Zustandsmatrix, S-Box, Klartext, Chiffretext,
   Verzweigungszahl. A native speaker reviews every German page.
3. Stamp the German page with the hash of the English source it translates:

   ```sh
   shasum -a 256 apps/web/src/content/docs/en/<path>.mdx | cut -c1-64
   # → put "sourceHash: sha256:<hex>" into the DE frontmatter
   ```

   When the English page changes, the hash no longer matches, which marks the translation as stale.
   Update the German text, then re-stamp the hash.
4. Add the page to the `sidebar` in `apps/web/astro.config.mts` by `slug`. Group labels need a `de`
   translation.
5. Verify:
   - `pnpm i18n:check` (fails if a page exists in only one locale)
   - `pnpm --filter @cryventure/web build`
   - `pnpm --filter @cryventure/web typecheck`
   - `pnpm lint`
   - `pnpm e2e` (add the page to `apps/web/e2e/lessons.spec.ts`)

## Components

Import them with relative paths from `apps/web/src/components/`.

| Component | Props | Use |
|---|---|---|
| `Lab.astro` | `labId`, `producerId`, `presetId?`, `layout?` (e.g. `state:65\|narration:35`), `lens?`, `startAt?`, `mode?` | Interactive lab. `startAt="round:1,op:subBytes"` opens at the first step whose fields all match; `startAt="step:12"` opens at the player's "Step 12" (`step:0` = initial state). A deep link's step always wins. `mode="story"` preselects Story mode (default `debugger`); playback never starts without the reader pressing Play. Invalid values fail the build. |
| `lesson/LessonSection.astro` | `part` | One of the six lesson parts |
| `lesson/WhyBox.astro` | `constant`, `title`; slot = explanation | "Why this constant?" (teal, π glyph) |
| `lesson/Formula.astro` | `caption?`; slot = a template string `` {`…`} `` | Monospace formula or pseudo-code block |
| `lesson/KeyFacts.astro` + `lesson/KeyFact.astro` | `label`, `value`, `kind?` | A row of fact tiles |
| `lesson/StateGrid.astro` | `cells` (16, column-major), `caption`, `kind?` | A 4×4 state table, `cells[r + 4c] = s[r,c]` |
| `lesson/RoundFlow.astro` | `input`, `output`, `stages[{title, ops[{label, kind}]}]`, `caption` | Round-structure diagram |
| `lesson/CheckQuestion.astro` | `number`, `question`, `options[]`, `answer` (0-based); slot = explanation | Multiple-choice question with a hidden answer |
| `lesson/ComingSoon.astro` | none | "Interactive views coming soon" note |

`kind` is one of `key`, `plaintext`, `ciphertext`, `state`, `constant` and maps to the `--cv-*`
tokens (amber, blue, violet, slate, teal). Every coloured element also has a glyph or label, so
colour is never the only cue.

The components' own UI strings live in `apps/web/src/i18n/{en,de}/lesson.json` (the `lesson.*`
keys). Text you pass as props or children belongs to the page and is translated with the page.
Never hard-code UI words inside a component.
