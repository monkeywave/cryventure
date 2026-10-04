# CryVenture — project status

> **Fresh session?** Read `docs/PLAN.md` (architecture + roadmap), then this file, then
> `docs/EXTENDING.md` / `docs/AUTHORING.md` as needed. Continue with **Next up** below.
> Update this file at the end of every milestone or significant change.

_Last updated: 2026-10-04 (M5 complete + /simplify + /code-review)._

## Where things live

| What                          | Where                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Repository                    | https://github.com/monkeywave/cryventure (`main`)                                    |
| Live site                     | https://monkeywave.github.io/cryventure/ (Pages source **must** be "GitHub Actions") |
| Docker image                  | `ghcr.io/monkeywave/cryventure` (amd64 + arm64)                                      |
| Plan / architecture           | `docs/PLAN.md`                                                                       |
| M2 design brief (facets etc.) | `docs/M2.md`                                                                         |
| M3 design brief (ports, modes)| `docs/M3.md`                                                                         |
| M4 design brief (derivers)    | `docs/M4.md`                                                                         |
| M5 design brief (hash, SHA-2) | `docs/M5.md`                                                                         |
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
| M4 GCM + Memory & Hardware (ISA/memory derivers + views) | ✅ done | ghash/gcm, derivers isa-x86/isa-armv8/memory, views instructions/registers/memory/field, CSP; **no core diff** after wave 1 (see `docs/M4.md`) |
| M5 Hash I (SHA-2, Hash port, SHA-NI/ARMv8 SHA2 derivers) | ✅ done | sha256/sha512/sha2-constants, `Hash` port, derivers isa-x86-sha/isa-armv8-sha, view wordops, hash lessons; **no core diff** after wave 1 (see `docs/M5.md`) |
| M6 Hash II (proposed, see Next up)                       | ⏭ next  | Phase 2a continued: SHA-3/Keccak, BLAKE2                                                                                          |
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

## What M4 delivered

- **No-core-diff proof:** core changed only in wave 1 (`e109460`: facet schemas `align`, `instructions`,
  `registers`, `memory`, `field`, GCM chain/wire kinds; GCM reference `core/math/gf128`, `core/modes/gcm`,
  `inc32` + optional `increment` on `ctrXor`). `git diff e109460 -- packages/core` stayed empty through
  derivers, views, lessons, reviews, `/simplify` and `/code-review`.
- **GCM:** primitives `ghash` (block and bit detail, `field` facet) and `gcm` (port `BlockCipher`, J0 rule
  for any IV length, inc32, GMAC, truncated tags, decrypt releases nothing on FAIL: a `candidate` region and
  withheld chain nodes). Conformance: McGrew–Viega TC 1–18 both directions, 244 filtered Wycheproof cases
  (all 16-byte tags), noble oracles for gcm and ghash.
- **Derivers (`packages/derivers`, plugins only):**
  - `isa-x86` / `isa-armv8`: real clang 23.1.0 `-O2` listings (`pnpm asm:generate`), `align` spans per
    `docs/M4.md` §1e, register values read from the trace. FIPS 197 App. C round states for C.1–C.3.
  - `memory`: `AES_KEY` as impl × triple from OpenSSL 3.5.9 (`data/SOURCES.md`): c-ref host-endian
    words, aesni `rounds` = 9/11/13, armv8 raw bytes. Layouts via `pnpm layouts:generate`.
  - Shared variant ids across kinds (`x86_64-aesni`, `x86_64-c-ref`, `aarch64-armv8-ce`, `aarch64-c-ref`).
- **Runtime:** lazy, memoised derivation in viz (`useFacet`, `useVariantChoice`, lab-wide variant
  preference, `<Lab variant>`); deriver-aware view lists in apps/web; `TabbedViews` tracks tabs by id.
- **Views:** `instructions`, `registers` (lane switch, MSB-first toggle), `memory` (target/impl pickers,
  u32 word toggle, field overlay, linked round keys), `field` (GF(2¹²⁸) terms); GCM styles in mode-chain and
  wire.
- **Contract kit:** `deriverContract` (goldens required, align/valueRef/i18n checks, memory lifetimes),
  derived facets in view fixtures, snapshot freshness tests + `pnpm fixtures:update`, `pnpm cv new deriver`.
- **Content (EN+DE, ai-reviewed):** `symmetric/modes/{ghash,gcm}`, `symmetric/aes/{memory-abi,aes-ni}`, the
  `memory-and-hardware` overview, the FlyThrough (Kamerafahrt) island, and the home hero lab. AES regions
  start blank (`··`) before the `input` op.
- **Deploy/security:** CSP from one source (`apps/web/src/security/csp.ts`): hashed meta on Pages, generated
  nginx header in Docker (`frame-ancestors 'none'`, no `'unsafe-inline'` in `script-src`), e2e violation
  listener, Docker subpath CI job. `pnpm licenses:check` in CI; `THIRD_PARTY_NOTICES.md` updated.

## What M5 delivered

- **No-core-diff proof:** core changed only in wave 1 (`07938ff`: the `Hash` port — `HashFunction`,
  `HashFamily`, `PortMap.Hash`, `hashFunction()` — and the `wordops` facet schema +
  `validateWordopsFacet`). `git diff 07938ff -- packages/core` stayed empty through derivers, views,
  lessons, reviews, `/simplify` and `/code-review`.
- **Primitives:** `sha256` (SHA-224/256), `sha512` (SHA-384/512, SHA-512/224, SHA-512/256 and the
  SHA-512/t IV generation function) and `sha2-constants` (K and IVs from exact `bigint` √/∛ of
  primes), on the untraced `_lib/sha2` reference and the core-only `_lib/sha2/manifestKit.ts`.
  Conformance: FIPS 180-4 / NIST examples incl. intermediate values (a … h, W_t), the full CAVP
  ShortMsg sets ≤ 128 bytes (65 + 65 for SHA-224/256, 4 × 129 for the SHA-512 family), noble oracles
  through `run()` and `ports.Hash`.
- **Derivers:** `isa-x86-sha` (SHA-NI) and `isa-armv8-sha` (ARMv8 SHA2) on the shared `_lib/sha`
  (trace reader, register/operand/span builders); values read from the trace, bytes only rearranged.
  The asm generator (`tools/src/asm`) now works from a kernel table (AES listings byte-identical).
- **View:** `wordops` (two-line 64-bit words, role glyphs, structural SHA-2 register-shift detection,
  op glyphs from a catalog; publishes `selection.valueRefId`).
- **Viz:** phone lab panels follow the layout order; wrap grids scroll with edge fades; capped
  regions reveal the current row; `useScrollRegion` / `ScrollRegion`.
- **Contract kit:** `PORT_SANITY.Hash` plus a port-vs-published-message check, `wordops` shape checks
  (primitives, derivers, view fixtures), a byte-identical listing guard, compact bundle fixtures.
- **Content (EN+DE, ai-reviewed):** `hash/{index,sha256,sha512}` (security notions, constants, SHA-NI,
  length extension conceptually and historically); GLOSSARY M5 terms.
- **Tests/CI:** e2e hash and layout specs; axe in legacy mode, `mountLabs` waits for rendered views;
  CI uploads `test-results` on failure.

## Next up — M6 (proposal: Hash II, PLAN §6 Phase 2a)

Write `docs/M6.md` first. Suggested scope:
1. Keccak-f[1600], SHA-3, SHAKE, cSHAKE with a sponge view (5 × 5 × 64 lane state, θ ρ π χ ι step
   choreography, rate/capacity split); Keccak round constants via the LFSR ("why these constants").
2. BLAKE2s/2b (ARX, reusing `wordops`); optionally MD5/SHA-1 as historical producers.
3. Extend the ISA family: a SHA-512 hardware deriver (ARMv8.2 SHA512) and ARMv8.2 SHA3
   (`EOR3`/`RAX1`/`XAR`/`BCAX`).
4. Consider the incremental `Hash` port (init/update/digest, midstate; a core change needed by
   Phase 2b HMAC) — decide in `docs/M6.md`.
5. Before planning any attack lab, ask the user (see Deviations).

## Deviations from the plan (decided)

- **Toolchain:** Astro 7.3 + Starlight 0.42 (plan said Astro 5); TypeScript pinned `~6.0`
  (typescript-eslint doesn't support TS 7 yet); Vitest 5; React 19.3; Tailwind 4.3.
- **PWA without `@vite-pwa/astro`:** it still peers `astro ≤ 5`, so a post-build `workbox-build`
  step plus `workbox-window` is used (see `docs/M3.md` §11, `docs/DEPLOY.md`).
- **M3 attack labs deferred (user decision 2026-10-03):** the CBC bit-flip, CTR keystream-reuse and
  padding-oracle labs and the padding-oracle lesson are not built. The CBC and CTR lessons cover the
  weaknesses conceptually and historically.
- **M4 core budget:** besides facet schemas, core got the GCM reference math (`gf128`, `gcm`, `inc32`)
  in wave 1, following the M3 precedent and the "reuse core/modes/ctr with inc32" goal; nothing after.
  `gcmJ0(h, iv)` takes no cipher/key (J0 needs neither). gcm keeps local copies of core-private helpers
  (`lengthBlock`, `tagsMatch`) because core is frozen.
- **M4 attack labs not planned:** GCM nonce reuse is conceptual/historical prose only (user rule).
- **Timeline stays on the state facet;** derived facets have own steps with `align` spans (M4.md §1e).
- **Visual gate = named Playwright screenshots,** not pixel baselines (macOS vs CI Linux rendering).
- **Triples:** x86_64-linux-gnu and aarch64-linux-gnu only; riscv64/Windows and the LLP64 probe deferred.
- **Snapshot fixtures** (views/derivers tests can't import producers) are guarded by freshness tests.
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
- **M5 x86 SHA-NI listing** is verified only against C models of `sha256rnds2`/`sha256msg1`/
  `sha256msg2` (Rosetta 2 lacks SHA); the ARM listing was verified natively on an M1.
- **M5 attack labs not planned:** length extension is conceptual/historical prose only (user rule).
- **SHA-224 IV:** FIPS 180-4 (and RFC 3874/6234) give values only and state no derivation; lessons
  present "low halves of the SHA-384 IV words" as a verifiable observation.
- **SHA-512 hardware deferred** (backlog for M6).
- **SP 800-107r1** is withdrawn but still cited (truncation), with a note saying so.
- **Hash axe tests** are marked slow (`test.slow()`).
- **German review** is an AI editorial pass (`translation.status: ai-reviewed`); a human native
  speaker sign-off (`human-reviewed`) is still outstanding.

## Open issues / ideas backlog

- Human native-speaker review of German (open questions in `docs/translation-review-2026-10.md`,
  e.g. Geheimtext vs. BSI "Chiffrat", "Knack es", "Spielwiese").
- Key-schedule words of one round key share one `valueRef` (`r/roundKey`); per-word ValueRefs needed
  for word-precise linked brushing across views.
- `view.state.region.summary` would need `count` for plural forms if 1-byte regions ever appear.
- Docker: local image builds worked again during M4 (CSP header checked against a real container);
  CI still builds and smoke-tests it on every push, now also with `CV_BASE=/cryventure/`.
- `astro preview` needs `--ignore-lock` when driven by agents (already in Playwright config).

### Deferred
- **From M3:**
  - Attack labs (bit-flip, keystream reuse, padding oracle) and the padding-oracle lesson. Kept for
    them: the worker runner, `pkcs7Check` and the read-only `flip` field on the `wire` facet.
  - `cbc(aes)` id grammar / `defineComposite`.
  - Lazy child traces (`children`).
  - Narration names the cipher by `id.toUpperCase()` in the M1–M4 producers. A producer title would be
    nicer, but `I18nRef` params can't nest refs. (M5 producers name the algorithm from their catalog.)
  - Two edge-fade mechanisms: the ByteGrid mask vs `.cv-scroll-shadow`, which is hidden by the opaque
    cells.
  - `runOptionsFor` in tools still defaults to the real registry, because `modeViewFixture` uses it.
  - The precache holds both locales (5.5 MB, 200 files at M3 end; budget 25 MB). Consider per-locale or runtime caching for unvisited pages.
  - After the `cv.lens` change, the lens flashes the default once on the first load after upgrading.
- **From M4:**
  - Facet-agnostic timeline (still tied to the `state` facet); deep-linked facet variants.
  - Static deriver applicability (producer capabilities in the manifest) and an async `derive` so ISA
    derivers can lazy-load only the listing for the run's key size — both need core changes.
  - Worker graphs duplicate primitive modules in the precache (~15 KB each); no producer uses
    `runIn: 'worker'` yet — prune when one does.
  - Tests may not import producers, so views/derivers use snapshot fixtures; consider a test-only ESLint
    exception instead.
  - LLP64 probe struct, riscv64/Windows triples, zeroization/lifetimes (Phase 8), PCLMULQDQ GHASH (Phase 4).
  - German open questions M4 items in `docs/translation-review-2026-10.md` (e.g. Lane vs. Spur, „das Tag“).
  - Home page on phones has no menu button (splash template); check whether that predates M4.
- **From M5:**
  - SHA-512 hardware (x86 `SHA512` extension `vsha512rnds2`…, ARMv8.2 `sha512h`/`sha512h2`/`sha512su0`/
    `sha512su1`).
  - `SHA256_CTX` in the memory deriver.
  - Incremental `Hash` port (init/update/digest, midstate for HMAC/PBKDF2) — a core change.
  - SHA-512 reference with 64-bit words as 32-bit hi/lo pairs (the `bigint` port is ~37× slower than noble).
  - `wordops` schema v2: per-term story/emphasis flag; a register-transfer spec instead of the view's
    structural SHA-2 shift detection; a root-degree field so the view can show √/∛.
  - Core `validateWordopsFacet` should not throw on malformed input and should export the role/op
    tables (tools duplicates them).
  - A generic `latestStepAt` in core (views/_lib holds a third copy).
  - Deriver applicability by facet contract instead of producer id; listing types generic over the role set.
  - Runtime listing JSON still carries `source` (≈15 KB); the penguin worker bundles all manifests.
  - ~1100 px of empty space under `wordops` on desktop (the state column shows one word per line);
    the sticky player takes ~31% of a phone screen.
  - Lab panels on phones now follow the layout order, which changed the first panel of the ghash/gf256 labs.
  - AES bundle fixtures switch to single-line JSON on their next change.
  - Style point „drücke ▶“ vs „Drück“ in `view.wordops.upcoming`; human German review of the M5 pages.
- The `key-schedule` view now renders any `derivation` facet generically — consider renaming it to
  `derivation` when HKDF/TLS key schedules arrive.
- `selection.valueRefId` is published by the key-schedule and `wordops` views and consumed by
  `wordops`, `instructions` and `memory`; `MathTerm` has no `valueRef` yet.
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
