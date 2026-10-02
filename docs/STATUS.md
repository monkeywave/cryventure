# CryVenture — project status

> **Fresh session?** Read `docs/PLAN.md` (architecture + roadmap), then this file, then
> `docs/EXTENDING.md` / `docs/AUTHORING.md` as needed. Continue with **Next up** below.
> Update this file at the end of every milestone or significant change.

_Last updated: 2026-10-02 (M2 complete)._

## Where things live

| What                          | Where                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Repository                    | https://github.com/monkeywave/cryventure (`main`)                                    |
| Live site                     | https://monkeywave.github.io/cryventure/ (Pages source **must** be "GitHub Actions") |
| Docker image                  | `ghcr.io/monkeywave/cryventure` (amd64 + arm64)                                      |
| Plan / architecture           | `docs/PLAN.md`                                                                       |
| M2 design brief (facets etc.) | `docs/M2.md`                                                                         |
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
| M3 Modes I (ECB/CBC/CTR, penguin, padding oracle, PWA)   | ⏭ next  |                                                                                                                                  |
| M4 GCM + Memory & Hardware (ISA/memory derivers + views) | ☐       | proves "views as plugins"                                                                                                        |
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

## Next up — M3 (from `docs/PLAN.md` §7)

1. Mode plugins `primitives/{ecb,cbc,ctr}` (+ `core/padding/pkcs7`) as `Mode(BlockCipher)` combinators; ModeChain +
   Wire views. Composite producers must load the i18n namespaces of all constituents (see backlog).
2. PenguinLab (worker, image upload); padding-oracle, CBC bit-flip and CTR reuse labs.
3. SP 800-38A vectors (as `conformance.json`).
4. PWA (`navigateFallback: null`, Pagefind in the precache, prompt-to-reload) — re-check `@vite-pwa/astro` vs Astro 7.

## Deviations from the plan (decided)

- **Toolchain:** Astro 7.3 + Starlight 0.42 (plan said Astro 5); TypeScript pinned `~6.0`
  (typescript-eslint doesn't support TS 7 yet); Vitest 5; React 19.3; Tailwind 4.3.
- **PWA deferred to M3:** `@vite-pwa/astro` doesn't support Astro 7 yet — re-check or use
  `vite-plugin-pwa`/workbox directly.
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
- **M3:** composite producers (`gcm(aes)`) must load the i18n namespaces of all constituents.
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
