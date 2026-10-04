# CryVenture — project status

> **Fresh session?** Read `docs/PLAN.md` (architecture + roadmap), then this file, then
> `docs/EXTENDING.md` / `docs/AUTHORING.md` as needed. Continue with **Next up** below.
> Update this file at the end of every milestone or significant change.

_Last updated: 2026-10-04 (M6 complete + /simplify + /code-review)._

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
| M6 design brief (SHA-3, BLAKE2)| `docs/M6.md`                                                                         |
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
| M6 Hash II (SHA-3/Keccak, BLAKE2, MD5/SHA-1, ARMv8.2)    | ✅ done | sha3/keccak-constants/blake2/md5/sha1, incremental `Hash` port + XOFs, `sponge` facet + view, wordops v2, derivers ARMv8.2 SHA512/SHA3; **no core diff** after wave 1 (see `docs/M6.md`) |
| M7 MAC & KDF I (proposed, see Next up)                   | ⏭ next  | Phase 2b: HMAC, HKDF, PBKDF2, KMAC, TLS PRFs                                                                                     |
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

## What M6 delivered

- **No-core-diff proof:** core changed only in wave 1, in two commits: `70546dc` (incremental `Hash`
  port — `HashContext` create/update/digest/clone, `XofFunction`/`XofContext`, `HashFamily.xofs`,
  `xofFunction()`) and `ffc201d` (`sponge` facet + `validateSpongeFacet`, wordops schema v2 with
  `transfers`/`touched`/`registerColumns`/`emphasis`/`degree` and a non-throwing validator plus
  exported `WORD_OPS`/`WORD_TERM_ROLES`, `words` layout `byteOrder`, generic `latestStepAt`).
  `git diff ffc201d -- packages/core` stayed empty through producers, derivers, views, lessons, the
  three reviews, `/simplify` and `/code-review`.
- **Primitives:** `sha3` (SHA3-224…512, SHAKE128/256, cSHAKE128/256, Keccak-256; `mapping`/`round`/
  `permutation` detail; message ≤ 200 bytes), `keccak-constants` (ι RC from the LFSR, ρ offsets from
  the (x, y) walk), `blake2` (eight BLAKE2s/b functions, keyed mode, G/round/block detail), `md5`,
  `sha1`. Shared libs `_lib/{keccak,blake2,legacy-md,hashKit}`: one manifest kit, one block-buffer
  context (SHA-2, MD5, SHA-1 as engines), real incremental contexts everywhere. SHA-2 producers emit
  wordops v2 (`sha512` gains `hKW` = h + K_t + W_t).
  Conformance: NIST FIPS 202 examples (incl. the SHA3-256 Msg0 θ/ρ/π/χ/ι states of round 0 and
  round 23), CAVP SHA-3/SHAKE ShortMsg + VariableOut ≤ 200 bytes (3234 cases), SP 800-185 cSHAKE
  samples 1–4, RFC 7693 App. A/B (per-round v) and App. E grand hash, 258 BLAKE2 keyed KATs, RFC 1321
  A.5, NIST SHA-1 examples + CAVP SHA1ShortMsg; noble oracles through `run()`, ports and contexts.
- **Derivers:** `isa-armv8-sha` gains `aarch64-armv8-sha512` (ARMv8.2 `sha512h/h2/su0/su1`) and the
  new `isa-armv8-sha3` (`aarch64-armv8-sha3`: `eor3`/`rax1`/`xar`/`bcax`), both from clang 23.1.0
  listings verified natively on an Apple M1 (`tools/src/asm/verify/`). Keccak listings carry a
  `loop` (body repeated 24× per permutation). Values only from the trace (`sponge` lanes, θ
  `c`/`d`/`partial`, ι `rc`; SHA-512 `hKW`/`T1`); clang's folded last (e, f) feed-forward is shown as
  an untraced partial sum with a note.
- **Views:** `sponge` (5 × 5 lane grid, rate/capacity, θ C/D rows, ρ badges, π arrows/labels, χ row,
  ι, squeeze/output; three lenses), `wordops` v2 (transfer arrows, BLAKE2 4 × 4 register grid with
  touched cells, story emphasis, √/∛; v1 facets upgraded on read), `state` little-endian words with a
  "memory order" toggle. Viz: captions wrap long hex; workspace panels are content-height.
- **Tools/web:** contract checks for `sponge`, wordops v2, `byteOrder`, XOF/context port sanity
  (incl. mid-squeeze clones and customised contexts), hash cross-check for single-function families
  and XOFs (keyed cases skipped as MACs); one `textFieldByteLength` (only the `input` field is
  hex-measured); one bundle-fixture table.
- **Content (EN+DE, ai-reviewed):** `hash/{md5-sha1,sponge,keccak,blake2}`; `hash/index` (three
  constructions) and `hash/sha512` (SHA-512 in hardware) updated; GLOSSARY M6 terms; open German
  questions under „M6“ in `docs/translation-review-2026-10.md`.
- **Tests/CI:** e2e `hash2Lessons`, `hash2Labs`, `sponge` (96 named lesson screenshots), the view
  contract render timeout raised for the SHA3 listings. Unit tests 7072, e2e 333 (root and subpath).

## Next up — M7 (proposal: MAC & KDF I, PLAN §6 Phase 2b)

Write `docs/M7.md` first. Suggested scope:
1. A `Mac` port (core, wave 1) and `HMAC(Hash)` over the incremental `Hash` port: ipad/opad
   ("why these constants"), the midstate via `clone()`, HMAC-SHA-256/384/512, HMAC-SHA3, keyed
   BLAKE2 through the same port; RFC 4231 / RFC 2202 / NIST vectors.
2. `HKDF(Mac)` (RFC 5869) with the `derivation` facet (consider renaming the `key-schedule` view to
   `derivation`), TLS 1.3 `HKDF-Expand-Label` as a preview; `PBKDF2` (RFC 8018, iteration counter
   view); KMAC128/256 on cSHAKE (SP 800-185); TLS 1.2 PRF (P_SHA256) and the TLS 1.0 PRF (MD5 ⊕ SHA-1).
3. Nested child traces (zoom HMAC → inner SHA-256 compression) — decide whether `children` is needed
   now (a core change).
4. Before planning any attack lab (e.g. HMAC timing comparison, length extension vs HMAC), ask the
   user (see Deviations).

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
- **M6 attack labs not planned:** MD5/SHA-1 collisions, reduced-round Keccak/BLAKE2 and Keccak-256 vs
  SHA3-256 are conceptual/historical prose only (user rule).
- **M6 core budget:** two wave-1 commits (port, then facet schemas + `latestStepAt`); nothing after.
- **M6 scope additions:** MD5 and SHA-1 producers (needed by the TLS 1.0 PRF in Phase 2b) and
  Keccak-256 (Ethereum padding) for domain separation; `sha3` messages ≤ 200 bytes (NIST 1600-bit
  example). x86 SHA512 and SHA-1 hardware are not built (no hardware to verify; Rosetta lacks them).
- **Keccak RC source:** FIPS 202 does not print the RC values (its Table 2 is the ρ offsets); the
  Keccak reference 3.0 §1.2 is cited for RC.
- **Keccak spans (M6 §5c as built):** the RC load and clang's late `xar` for lane 24 are zero-width
  at χ (spans never decrease); SHA spans still throw on reordered round instructions.
- **Text params:** only the text field named `input` is hex-measured when `encoding` is `'hex'`
  (`textFieldByteLength`); a per-field declaration would need core.
- **Lesson word limit:** some cited facts in `hash/{index,sha512,blake2}` moved into tables to keep
  prose ≤ 150 words per section.
- **Port speed tests** use a generous 1000 ms per KiB bound (flake-proof; catches only gross
  regressions).
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
  - x86 SHA-512 hardware (`vsha512rnds2`…); ARMv8.2 SHA512 done in M6.
  - `SHA256_CTX` in the memory deriver.
  - SHA-512 reference with 64-bit words as 32-bit hi/lo pairs (the `bigint` port is ~37× slower than noble).
  - Deriver applicability by facet contract instead of producer id; listing types generic over the role set.
  - Runtime listing JSON still carries `source` (≈15 KB); the penguin worker bundles all manifests.
  - Empty space next to short panels on desktop (panels are content-height since M6, but the row is
    as tall as the state column; sticky short panels would fix it); the sticky player takes ~31% of a
    phone screen.
  - Lab panels on phones now follow the layout order, which changed the first panel of the ghash/gf256 labs.
  - AES bundle fixtures switch to single-line JSON on their next change.
  - Style point „drücke ▶“ vs „Drück“ in `view.wordops.upcoming`; human German review of the M5 pages.
- **From M6:**
  - Core-only fixes found in M6 reviews: validators ignore `kind`, accept NaN/Infinity params and
    `stepCount: NaN`, and wordops accepts a transfer source with both `register` and `term`;
    `latestStepAt` assumes sorted input; core still has `mathStepAt`/`fieldStepAt` copies.
  - A per-field "hex-switchable" declaration on `ParamField` (replacing the `input` name convention),
    a manifest hook mapping params to a port call (hash cross-check without hard-coded param names),
    a term expression ref on `WordTerm`/`RegisterTransfer` (the wordops view splits translated labels
    on " = "), a "computes-at" step on `AlignSpan` (instructions scheduled ahead of their round).
  - Async `derive` (or a split deriver) so the SHA-256 lab doesn't download the SHA-512 listing (≈85 KB).
  - 32-bit hi/lo Keccak/BLAKE2b/SHA-512 port implementations (Keccak port ≈ 56× slower than node's
    sha3) — needed once PBKDF2/ML-KEM use the ports.
  - Deriver applicability from bundle contents instead of producer ids.
  - Golden/bundle fixtures are large (SHA3 golden 2.9 MB pretty-printed, ≈ 114 KB gzipped; CAVP SHA-3
    vectors 1.2 MB): consider minified JSON or per-facet hashes.
  - BLAKE2 salt/personalization, BLAKE3, KangarooTwelve/TurboSHAKE; SHA-1 hardware.
  - Sponge π arrows switch at a hand-tuned 30rem container width (tied to `--cv-sponge-lane`).
  - 15 copies of `overflow-wrap: anywhere` across view CSS → one shared hex-text class.
  - Human German review of the M6 pages (open items under „M6“ in the review report).
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
pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test && pnpm licenses:check \
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
