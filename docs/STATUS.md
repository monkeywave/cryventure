# CryVenture — project status

> **Fresh session?** Read `docs/PLAN.md` (architecture + roadmap), then this file, then
> `docs/EXTENDING.md` / `docs/AUTHORING.md` as needed. Continue with **Next up** below.
> Update this file at the end of every milestone or significant change.

_Last updated: 2026-10-03 (M3 complete + /simplify + /code-review)._

## Where things live

| What                          | Where                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Repository                    | https://github.com/monkeywave/cryventure (`main`)                                    |
| Live site                     | https://monkeywave.github.io/cryventure/ (Pages source **must** be "GitHub Actions") |
| Docker image                  | `ghcr.io/monkeywave/cryventure` (amd64 + arm64)                                      |
| Plan / architecture           | `docs/PLAN.md`                                                                       |
| M2 design brief (facets etc.) | `docs/M2.md`                                                                         |
| M3 design brief (ports, modes)| `docs/M3.md`                                                                         |
| Add plugins                   | `docs/EXTENDING.md` (`pnpm cv new primitive\|view <id>`)                             |
| Write lessons, EN/DE workflow | `docs/AUTHORING.md`, `docs/GLOSSARY.md`                                              |
| Deploy                        | `docs/DEPLOY.md`                                                                     |
| German review report          | `docs/translation-review-2026-10.md`                                                 |

## Milestones

| Milestone                                                | State   | Notes                                                                                                                            |
| -------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| M0 Walking skeleton                                      | ✅ done | monorepo, core contracts, AES plugin, generic `<Lab>` island, EN/DE, CI, Pages, Docker                                           |
| M1 Full AES                                              | ✅ done | Story + Debugger modes, choreography, key-schedule view, 5 AES lessons (EN+DE)                                                   |
| M1 follow-ups                                            | ✅ done | mobile caption + sticky player, inline derivation chain, contrast tokens, German AI review, plurals, translation freshness check |
| M2 Foundations + S-box                                   | ✅ done | GF(2⁸)/S-box plugins, math + table facets, foundations lessons, quiz + progress, lens, prologue (see `docs/M2.md`)                |
| M3 Modes I (ECB/CBC/CTR, penguin, PWA)                   | ✅ done | ports + mode primitives, mode-chain/wire views, PenguinLab, PWA, modes lessons (see `docs/M3.md`); attack labs deferred           |
| M4 GCM + Memory & Hardware (ISA/memory derivers + views) | ⏭ next  | proves "views as plugins"                                                                                                        |
| Phases 2–10                                              | ☐       | see `docs/PLAN.md` §6                                                                                                            |

## What M2 delivered

- **Core:** GF(2⁸) math moved to `core/math` (`gf256`, step explainers `xtimeSteps`/`gmulSteps`/`ginvSteps`,
  `rijndaelAffine`); new facets `math` and `table`; `RegionSpec.initial: 'blank'` (unwritten cells show `··`).
- **Plugins:** primitives `xor`, `endian`, `gf256` (calculator), `aes-sbox` (S-box derivation); views `math`
  (bit strips, polynomial notation in the cryptographer lens) and `lookup-table` (16×16 explorer; click → re-run).
- **Runtime:** `useLabActions().requestParams(patch)` lets a view re-run its lab; labs without scope levels show
  "Step n / N" instead of "Round"; shared `MathText` superscript formatter in viz.
- **App:** interactive quiz (`CheckQuestion.astro` → island, same MDX API), progress store `cv.progress.v1`
  (migrations, export/import, `/<lang>/progress/`), page-wide Lens (header select, `<Lens level|only>`),
  prologue onboarding (`foundations/prologue`, home hero starts there).
- **Content (EN+DE, ai-reviewed):** `foundations/{prologue,xor,endianness,gf256}`, `symmetric/aes/sbox-derivation`.
- **Contract kit:** every view is rendered against facet fixtures generated from real primitives (EN/DE × lenses ×
  steps); every primitive needs `vectors/conformance.json` (generic format, see EXTENDING); generic-player e2e on
  the XOR lab.

## What M3 delivered

- **Step 0 (M2 backlog):**
  - `StateFacet.initialNarration` and narration/math at step −1. There are no synthetic `load` steps
    any more, and lessons no longer need `startAt="op:load"`.
  - Stable quiz ids (`<CheckQuestion id>`). Progress schema v2 lives in `cv.progress.v2`; v1 is
    migrated through a frozen number→id map, `apps/web/src/progress/legacyQuizIds.json`. The lens lives
    in `cv.lens`.
- **Core:**
  - Ports (`BlockCipher`, `PortMap`), `preparePorts`/`requirePort`, and the param kinds `port` and `text`.
  - `pkcs7`, untraced reference modes `core/modes/{ecb,cbc,ctr}`, and shared block-mode recording and
    facet helpers.
  - The `chain` and `wire` facets.
  - `PrimitiveManifest.runIn` and `blockLabParams`.
- **Plugins:**
  - Primitives `ecb`, `cbc`, `ctr`, with SP 800-38A F.1/F.2/F.5 (18 cases) as conformance and noble
    oracles.
  - Views `mode-chain` (lanes, ≡ markers for equal blocks, zoom into the AES lab per block) and `wire`.
- **Web:**
  - Port resolution in the lab host and a generic worker runner (`runIn: 'worker'`; no producer uses it
    yet).
  - The standalone route `/<lang>/lab/<id>/`, used for zoom links.
  - Run errors on re-run keep the lab, text and hex edits are debounced, and links that fail at run time
    fall back to the preset.
  - PenguinLab island (worker, original artwork, local upload).
  - PWA via `workbox-build` + `workbox-window`: precache incl. Pagefind, prompt-to-reload, offline e2e,
    and a self-unregistering `sw.js` with `CV_PWA=false`.
- **Content (EN+DE, ai-reviewed):** `symmetric/modes/{index,ecb,cbc,ctr}`. CBC ends with a historical
  "Why CBC is being retired" section (BEAST, Lucky Thirteen and POODLE by name per RFC 7457; TLS 1.3 is
  AEAD-only). CTR ends with the counter-uniqueness rule.

## Next up — M4 (from `docs/PLAN.md` §7)

Deliverables:
1. `primitives/{ghash,gcm}` over the `BlockCipher` port: GCM spec vectors (SP 800-38D) and Wycheproof.
   The lessons are `modes/{gcm,ghash}`.
2. **Extensibility proof:** `derivers/isa-x86`, `derivers/isa-armv8` and `derivers/memory`, plus views
   `instructions`, `registers` and `memory`, as plugins only. Core gains only facet schemas. Includes the
   deriver-aware `viewsFor`.
3. Lessons `aes/{memory-abi,aes-ni}`, precomputed asm JSON, the fly-through animation and the hero lab.
4. CSP: a meta tag on Pages and real headers in Docker. `THIRD_PARTY_NOTICES.md`, a11y and visual gates.

Design questions to settle first (write `docs/M4.md` before coding):
- **Deriver contract in practice:** lazy derivation, memoisation per bundle, and facet variants
  (`memory@x86_64-linux-gnu`). Also where the timeline goes when a facet has its own steps (`align`).
- **GCM:** whether the GHASH multiply gets a `math` facet (128-bit terms exceed the 32-bit
  `MathTerm.width`), and how GCM composes CTR (reuse `core/modes/ctr` with the 32-bit `inc32`).
- **Attack labs (GCM nonce reuse is planned in PLAN):** in M3 the safety classifier repeatedly stopped
  attempts at attack-lab producers. **Confirm with the user before planning any attack lab**, and
  default to conceptual and historical treatment in prose.

## Deviations from the plan (decided)

- **Toolchain:** Astro 7.3 + Starlight 0.42 (plan said Astro 5); TypeScript pinned `~6.0`
  (typescript-eslint doesn't support TS 7 yet); Vitest 5; React 19.3; Tailwind 4.3.
- **PWA without `@vite-pwa/astro`:** it still peers `astro ≤ 5`, so a post-build `workbox-build`
  step plus `workbox-window` is used (see `docs/M3.md` §11, `docs/DEPLOY.md`).
- **M3 attack labs deferred (user decision 2026-10-03):** the CBC bit-flip, CTR keystream-reuse and
  padding-oracle labs and the padding-oracle lesson are not built. The CBC and CTR lessons cover the
  weaknesses conceptually and historically.
- **Zoom params live in the manifest** (`blockLabParams`), not on the `BlockCipher` port.
- **German term:** "mode of operation" = „Betriebsmodus“ (plural „Betriebsmodi“) per GLOSSARY.
- **Full AES and axe a11y checks** landed already in M0/M1 (pulled forward).
- **Hardware views** will be derivers (`derivers/isa-*`), not engine code (per §2b).
- **ShiftRows choreography** animates in "before" coordinates and snaps at row end (the `after`
  snapshot already holds shifted values) — documented in `primitives/src/aes/choreo/`.
- **Quizzes are authored in MDX** (`<CheckQuestion>` props + slot) instead of a bilingual YAML `quizzes`
  collection: keeps per-page translation + sourceHash freshness. Progress keys are slug-based (`lessonKey`),
  shared between EN and DE; a question counts as solved once answered correctly.
- **No nanostores:** page-wide prefs (lens) live in the progress store (`useSyncExternalStore`).
- **Hex convention:** lowercase everywhere in UI; single GF(2⁸) elements in lessons/narration use FIPS `{57}`, `•`.
- **German review** is an AI editorial pass (`translation.status: ai-reviewed`); a human native
  speaker sign-off (`human-reviewed`) is still outstanding.

## Open issues / ideas backlog

- Human native-speaker review of German (open questions in `docs/translation-review-2026-10.md`,
  e.g. Geheimtext vs. BSI "Chiffrat", "Knack es", "Spielwiese").
- Key-schedule words of one round key share one `valueRef` (`r/roundKey`); per-word ValueRefs needed
  for word-precise linked brushing across views.
- `view.state.region.summary` would need `count` for plural forms if 1-byte regions ever appear.
- Docker image can't be built locally on this machine (Docker Desktop proxy times out on Docker Hub);
  CI builds and smoke-tests it on every push.
- `astro preview` needs `--ignore-lock` when driven by agents (already in Playwright config).

### Deferred
- **From M3:**
  - Attack labs (bit-flip, keystream reuse, padding oracle) and the padding-oracle lesson. Kept for
    them: the worker runner, `pkcs7Check` and the read-only `flip` field on the `wire` facet.
  - `cbc(aes)` id grammar / `defineComposite`.
  - Lazy child traces (`children`).
  - Narration names the cipher by `id.toUpperCase()`. A producer title would be nicer, but `I18nRef`
    params can't nest refs.
  - Two edge-fade mechanisms: the ByteGrid mask vs `.cv-scroll-shadow`, which is hidden by the opaque
    cells.
  - `runOptionsFor` in tools still defaults to the real registry, because `modeViewFixture` uses it.
  - The precache holds both locales (5.5 MB, 200 files at M3 end; budget 25 MB). Consider per-locale or runtime caching for unvisited pages.
  - After the `cv.lens` change, the lens flashes the default once on the first load after upgrading.
- **M4:** deriver-aware `viewsFor` in `apps/web/src/labs/registry.ts`; facet-agnostic timeline
  (today tied to the `state` facet). The core deriver contract (`defineDeriver`) is kept for this.
- The `key-schedule` view now renders any `derivation` facet generically — consider renaming it to
  `derivation` when HKDF/TLS key schedules arrive.
- `selection.valueRefId` is published by the key-schedule view but not yet consumed (linked brushing);
  `MathTerm` has no `valueRef` yet.
- Lab islands render `data-lens="engineer"` until hydration (`client:visible`), so story/cryptographer learners
  see engineer view content briefly; `<Lens>` blocks in MDX don't flash (inline head script).
- View-contract renders skip axe (no vitest axe helper); axe runs in Playwright only.
- Lookup-table touch cells are ~17px wide on a 390px phone (compact font chosen over scrolling).
- `symmetric/aes/subbytes-sbox` concept section is over the 150-word limit (≈190 incl. the cryptographer Lens block).
- **From the M2 /simplify review (deeper redesigns, not done):**
  - `stateAt` could return `undefined` for never-written cells, replacing `RegionSpec.initial: 'blank'` +
    `unwrittenAt` special-casing in motion/watch code.
  - Let a facet carry narration/math for the initial state (step −1) so producers don't need synthetic `load`
    steps and lessons don't need `startAt="op:load"`.
  - Quiz answers are keyed by question number; reordering questions re-attaches old answers — add stable ids.
  - `MathText` superscripts every `^n` in translated text; a param-level formatter would be safer.
  - Pages with several labs embed the same `messages` JSON per island; one shared per-page blob would save ~15 KB.
  - One quiz island per lesson instead of one per question.
- `StateRegions` passes `step={facet.steps[step]}` to every `RegionPanel`, so memoised panels still re-render each
  step (stable `unwrittenAt` Sets are in place; pass only per-region data to finish this).
- Add the M3 terms (Zählermodus, Zählerblock, Anfangszählerblock, Schlüsselstrom, formbar) to
  `docs/GLOSSARY.md`.
- Unused keys `lesson.check.reveal` / `lesson.check.answer` in `lesson.json` (left in place).

## Quality gates (all must be green before committing)

```sh
pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test \
  && pnpm --filter @cryventure/web build && pnpm e2e && pnpm --filter @cryventure/web e2e:subpath
```

CI runs the same plus a container smoke test; the Pages workflow re-runs the Playwright suite
against the live URL after every deploy.

## Working conventions

- Orchestrate with sub-agents; give each a disjoint set of files; only one agent installs packages
  at a time.
- Every user-facing string goes through i18n (EN + DE); German follows `docs/GLOSSARY.md`.
- Tests for every function; verify in the running app (Playwright screenshots) before committing.
- Commit messages end with the Claude co-author line; push to `main` triggers CI, Pages and Docker.
