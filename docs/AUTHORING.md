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
| 6 | `check` | Three `<CheckQuestion>`s (interactive quiz, see [Check questions](#check-questions)) |

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
   components and props, and translated text only. Follow the term base and style guide in
   `docs/GLOSSARY.md` (du-form, „…“ quotes, „16 Byte“, Klartext/Geheimtext, Schlüsselexpansion vs.
   Schlüsselplan, …). Every German page goes through the review workflow below.
3. Stamp the German page with the hash of the English source it translates (run from the repo
   root, or use `pnpm -w i18n:stamp …` from a subdirectory; several pages at once are fine):

   ```sh
   pnpm i18n:stamp apps/web/src/content/docs/de/<path>.mdx
   ```

   This writes `sourceHash: sha256:<hex>` (SHA-256 of the EN file at the same path) into the DE
   frontmatter, replacing an older value. Stamp only after the German text matches the current
   English page: the stamp is the claim "this translation is up to date".

   Manual fallback (same value):

   ```sh
   shasum -a 256 apps/web/src/content/docs/en/<path>.mdx | cut -c1-64
   # → put "sourceHash: sha256:<hex>" into the DE frontmatter
   ```

   `pnpm i18n:check` fails when a DE page has no `sourceHash` or when its hash no longer matches the
   English page (the translation is stale). Then update the German text, re-stamp the hash, and set
   `translation.status` back to `ai-reviewed` if it was `human-reviewed`.
4. Add the page to the `sidebar` in `apps/web/astro.config.mts` by `slug`. Group labels need a `de`
   translation.
5. Verify:
   - `pnpm i18n:check` (fails if a page exists in only one locale, on a missing or stale
     `sourceHash`, and on German style errors)
   - `pnpm --filter @cryventure/web build`
   - `pnpm --filter @cryventure/web typecheck`
   - `pnpm lint`
   - `pnpm e2e` (add the page to `apps/web/e2e/lessons.spec.ts`)

## Translation review

German pages record their review state in the frontmatter (schema: `apps/web/src/content.config.ts`):

```yaml
translation:
  status: ai-reviewed          # or human-reviewed
  reviewedAt: '2026-10-02'     # YYYY-MM-DD (quote it)
  reviewer: AI editorial review (Claude)   # optional
```

Workflow:

1. **Author EN.** Write and fact-check the English page.
2. **Translate DE.** Create the German page, stamp `sourceHash`, run `pnpm i18n:check` until it
   reports no errors (style lint included).
3. **AI review → `ai-reviewed`.** An editorial pass against the EN source and `docs/GLOSSARY.md`
   (meaning, terminology, grammar, typography). Set `status: ai-reviewed` and the date. Note open
   questions in a `docs/translation-review-*.md` report.
4. **Native speaker → `human-reviewed`.** A native German speaker with crypto background reads the
   page, resolves the open questions, and sets `status: human-reviewed`, `reviewedAt` and
   `reviewer` (name or handle).

When the EN page changes (new `sourceHash`), update the DE text and drop the status back to
`ai-reviewed` until a human has looked at the changed part again. UI catalogs follow the same
rules; their review state is tracked in the review report.

## Plural forms in catalogs

`t(key, params)` picks a plural form when `params.count` is a number and plural keys exist
(`Intl.PluralRules` of the page locale; see `createTranslator` in `packages/core/src/i18n.ts`):

```json
"plugin.aes.beat.shiftRows.row_one": "Zeile {{row}} rotiert um {{count}} Position nach links …",
"plugin.aes.beat.shiftRows.row_other": "Zeile {{row}} rotiert um {{count}} Positionen nach links …"
```

- The producer must pass `count` (e.g. `i18nRef(key, { row, count: row })`); the bare key is used
  as a fallback.
- `_other` is required in every locale; EN and DE may use different category sets. `_zero` is an
  optional explicit override for 0.
- All forms use the params of EN `_other`; a non-`other` form may spell the number out and drop
  `{{count}}`.
- Unit words that do not inflect need no plural keys: „{{bytes}} Byte“.

## Components

Import them with relative paths from `apps/web/src/components/`.

| Component | Props | Use |
|---|---|---|
| `Lab.astro` | `labId`, `producerId`, `presetId?`, `layout?` (e.g. `state:65\|narration:35`), `lens?`, `startAt?`, `mode?` | Interactive lab. Without `lens` it follows the page lens live; `lens` pins it. `startAt="round:1,op:subBytes"` opens at the first step whose fields all match; `startAt="step:12"` opens at the player's "Step 12" (`step:0` = initial state). A deep link's step always wins. `mode="story"` preselects Story mode (default `debugger`); playback never starts without the reader pressing Play. Invalid values fail the build. |
| `lesson/LessonSection.astro` | `part` | One of the six lesson parts |
| `lesson/WhyBox.astro` | `constant`, `title`; slot = explanation | "Why this constant?" (teal, π glyph) |
| `lesson/Formula.astro` | `caption?`; slot = a template string `` {`…`} `` | Monospace formula or pseudo-code block |
| `lesson/KeyFacts.astro` + `lesson/KeyFact.astro` | `label`, `value`, `kind?` | A row of fact tiles |
| `lesson/StateGrid.astro` | `cells` (16, column-major), `caption`, `kind?` | A 4×4 state table, `cells[r + 4c] = s[r,c]` |
| `lesson/RoundFlow.astro` | `input`, `output`, `stages[{title, ops[{label, kind}]}]`, `caption` | Round-structure diagram |
| `lesson/CheckQuestion.astro` | `id` (required, kebab-case), `number`, `question`, `options[]`, `answer` (0-based); slot = explanation | Interactive multiple-choice question, see below |
| `lesson/ComingSoon.astro` | none | "Interactive views coming soon" note |
| `lesson/Lens.astro` | `level` or `only` (`story`, `engineer`, `cryptographer`); slot = content | Lens-dependent content, see below |

`kind` is one of `key`, `plaintext`, `ciphertext`, `state`, `constant` and maps to the `--cv-*`
tokens (amber, blue, violet, slate, teal). Every coloured element also has a glyph or label, so
colour is never the only cue.

The components' own UI strings live in `apps/web/src/i18n/{en,de}/lesson.json` (the `lesson.*`
keys). Text you pass as props or children belongs to the page and is translated with the page.
Never hard-code UI words inside a component.

### Check questions

`<CheckQuestion>` renders the interactive quiz island (`islands/QuizQuestion.tsx`, docs/M2.md §5).
Readers pick an option and press Check; they get "Correct!" or "Not quite", may retry, and see the
answer and your explanation (the slot) once they get it right.

- **Every question has a stable `id`** (docs/M3.md §0b): `<CheckQuestion id="ecb-penguin" number={1} …>`.
  - The id is required, kebab-case and starts with a letter (`aes192-rounds`, `rcon-10`). It names
    what the question asks, and is a string literal (not an expression).
  - It is unique within the lesson, and identical in EN and DE.
  - **It never changes** once published: progress is stored under it. To replace a question with a
    different one, give the new question a new id.
  - `number` is display-only. Renumbering, reordering, inserting or removing questions is fine.
  - A missing or non-kebab id, or a duplicate id in one lesson, fails the build (the progress page
    reads every lesson's `{ id, number }` list from the MDX source). A unit test also checks that EN
    and DE use the same ids.
- **Progress is per lesson key.** The key is the page slug without base and locale
  (`symmetric/aes/subbytes-sbox`), and each answer is stored under the question's id in localStorage
  under `cv.progress.v1` (the slot name; the record inside is schema version 2 and is migrated on
  read). EN and DE pages therefore share progress: keep the same ids and the same `answer` index in
  both languages.
- **Answers from before ids** (schema v1, keyed by number) live in `legacyQuiz` and are still shown
  for the question with that `number` until the reader answers it again; then they move to the id.
  After a renumbering, such an old answer may show on a different question. This is accepted, and
  it never affects answers stored under ids.
- **Without JavaScript** the server output is still a readable question with the answer and
  explanation in a `<details>` element.
- **Progress page.** `/<lang>/progress/` (sidebar entry "Your progress" / "Dein Fortschritt") lists
  every lesson with check questions in reading order, with its score, plus export, import and
  reset. A page shows up there automatically once it contains a `<CheckQuestion>`.
- UI strings live in `apps/web/src/i18n/{en,de}/quiz.json` (`quiz.*` keys).

### Foundations labs

The Foundations track uses small producers and two views beyond `state` and `narration`.
Producers: `xor`, `endian`, `gf256`, `aes-sbox`. Views: `math` (an equation with bit strips,
caret exponents such as `a^3` shown as superscripts) and `lookup-table` (the 16×16 S-box with the
current row and column). Layouts as used in the lessons:

| Lesson | Lab |
|---|---|
| `foundations/xor` | `producerId="xor" presetId="hello" layout="state:65\|narration:35"` |
| `foundations/endianness` | `producerId="endian" presetId="classic" layout="state:65\|narration:35"` |
| `foundations/gf256` | `producerId="gf256" presetId="fips197-mul" layout="math:50\|state:20\|narration:30"` (also `presetId="inverse"`) |
| `symmetric/aes/sbox-derivation` | `producerId="aes-sbox" presetId="fips-53" startAt="op:result" layout="lookup-table:45\|math:35\|narration:20"` |

### Lens blocks

Readers pick a page-wide lens in the header (Story / Engineer / Cryptographer, default Engineer;
stored with their progress). Wrap lens-specific prose in `<Lens>`:

```mdx
import Lens from '../../../../../components/lesson/Lens.astro';

<Lens level="engineer">

Shown for the engineer and cryptographer lenses.

</Lens>

<Lens only="story">

Shown for the story lens only.

</Lens>
```

- `level` shows the block for that lens and deeper ones; `only` for exactly that lens. Pass one.
- Each block carries a small translated badge ("Cryptographer lens"). Keep the blank lines inside
  so the content is parsed as Markdown.
- Hiding is pure CSS (`display: none`, so screen readers skip it too). Without JavaScript the page
  behaves as the engineer lens, so core content must never sit in a `level="cryptographer"` or
  `only` block alone.
- Wrap the same blocks in the EN and DE page.
