# CryVenture — Explore cryptography. Build understanding.

## Context
Greenfield project (empty dir `…/2026_success/cryventure`). Goal: a web-based, animation-heavy, interactive crypto
learning platform (inspired by tls13.xargs.org and the Rijndael Animation v4) covering symmetric ciphers & modes,
hash/PRF/HKDF internals, the DH/ECDH family, PQC and real protocols. It needs:
- playgrounds with adjustable parameters
- step-by-step internal state
- memory and ABI layout views
- hardware context (AES-NI, etc.)
- "why these constants" boxes
- attack labs
- gamification

**User decisions:**
- Astro 5 + Starlight + React 19 islands (TypeScript, Tailwind 4)
- EN + DE from day one; all UI text goes through i18n
- Static-first: localStorage progress, PWA/offline; backend later
- **Runs directly as a github.io site AND as a Docker container** (§7b)
- **Built for extension from day one:** new views (instructions, memory, later filesystem, network packets…), new primitives and new protocols are plugins (§2b)
- MVP = AES deep-dive + modes

The plan below was drafted by a design agent from three research passes. It was then refined by three review agents: crypto correctness/curriculum, engineering architecture, and pedagogy/animation UX.

### Research conclusions
- **We write our own crypto code.** No library exposes round-level state, so we build our own instrumented TS "trace engine".
  - It is verified in CI against noble-ciphers/hashes/curves/post-quantum (plus `mlkem` and liboqs-js) and official vectors:
    FIPS 197 App. A–C, SP 800-38A/D, FIPS 46-3/SP 800-20, RFC 8439, RFC 6229, FIPS 180-4 + NIST intermediate values,
    RFC 5869, RFC 8448, RFC 7748, ACVP JSON for FIPS 203/204/205, Wycheproof, C2SP CCTV.
  - noble has no DES or RC4.
- **Animation:** one deterministic playhead drives everything, rendered by React SVG/DOM and **Motion** (MIT), with D3 submodules for scales and curves.
  - No GSAP: its license is proprietary.
  - No PixiJS.
- **Assembly and struct layouts are precomputed at build time:** pinned clang per target triple, JSON committed, and an "Open in Compiler Explorer" deep link. We never call godbolt live.
- **Open-source projects:**
  - **Borrow patterns and captures:** illustrated-tls13/12/quic/dtls (MIT; keep their notices).
  - **References:** CyberChef and CrypTool-Online (Apache-2), cryptii, Corbellini's ECC demos, 2key-ratchet (MIT).
  - **Libraries:** ts-fsrs (MIT) for spaced repetition; Pyodide optional.
  - **Razzia (MIT):** only as an optional live-quiz service later, not the base.
  - **Inspiration only, no code copied:** sha256algorithm.com (no license), the Rijndael Flash animation (proprietary), GPL projects (Noise Explorer, etc.).
  - **Avoid:** WebContainers, Theatre.js, Idyll, Open edX.
  - **Flagship gap:** there is no good open-source ML-KEM step-by-step visualizer.
- **Reuse from sibling repos** (`…/2026_success/`):
  - `memory_slice/git/MemDiver/frontend/src/components/hex/` — **port selectively**: `highlight-utils.ts` (region index), the hex codec, and `HexRow`'s render/memo approach.
    - `HexViewer` and `OverlayByteInspector` are coupled to global stores and `/api/inspect`, so we write a new prop-driven `HexMemoryView` and budget it as new work.
  - `memory_slice/git/MemDiver/core/structure_defs.py` and `structure_overlay.py` → port the field/offset model to TS.
  - `memory_slice/git/MemDiver/frontend/src/ftue/` (driver.js tours) and `components/charts/` → later phases.
  - `halo/halo_engine/protocols/{tls,mtproto,wireguard,ssh}.py` → spec references (prf12, hkdf_expand_label, TLS 1.3 schedule, IGE).
  - `keys-in-flux-paper-material/TLS/lldb/*_cb_13.py` → "Secrets in memory" lab (14 TLS libraries, key lifetimes).
  - `fritap-web/frontend/src/index.css` → port the design tokens only (the code is SolidJS).
  - `CipherForgeDev` → offline generator for real handshakes, keylogs and memory dumps.

## 1. Monorepo (pnpm workspaces, `pnpm -r`; no Turborepo until caching pays off)
```
cryventure/
├─ apps/web/                Astro 5 + Starlight + @astrojs/react + @astrojs/starlight-tailwind (TW4) + @vite-pwa/astro
│  ├─ src/content/docs/{en,de}/   MDX lessons            ├─ src/content/quizzes/   bilingual YAML (zod)
│  ├─ src/content/i18n/{en,de}.json  Starlight UI strings ├─ src/i18n/{en,de}/*.json  app/lab dictionaries (namespaced)
│  ├─ src/islands/Lab.tsx   ONE generic lab island: resolves producer + views from the registries by id (+ Quiz, HeroLab)
│  ├─ src/pages/[lang]/lab/[id].astro   standalone full-width labs via <StarlightPage> (generated from the registry)
│  ├─ src/components/       LessonSection.astro, Breakout.astro, EducationalOnly.astro, LanguageSelect override
│  ├─ src/styles/tokens.css semantic --cv-* tokens (ported fritap-web palette) → --sl-color-* + Tailwind @theme
│  └─ e2e/                  Playwright
├─ packages/core/           pure TS, no DOM, no algorithms: Trace/Facet/ValueRef types, tracers, stateAt, registries,
│                           primitive interfaces (BlockCipher, Aead, Hash, Mac, Kdf, Group, Kem, Signature…), JSON schemas
├─ packages/primitives/     one folder per algorithm plugin  (aes/, gcm/, sha2/, hkdf/, x25519/, ml-kem/ …)
├─ packages/protocols/      one folder per protocol plugin   (tls13/, tls12/, wireguard/, ssh/, signal/, mtproto/ …)
├─ packages/derivers/       facet derivers: isa-x86/, isa-armv8/, memory/ (ABI + struct layouts data), packets/, filesystem/
├─ packages/viz/            React: player, choreography, scene graph, design-system primitives, workspace (dock layout)
├─ packages/views/          one folder per view plugin (state, instructions, registers, memory, derivation, sequence,
│                           packets, filesystem, narration, code …)
├─ packages/tools/          dev-only: noble oracles, vector importers, plugin contract-test kit, `cv` scaffolder, i18n parity,
│                           layout/asm generators (own Docker image, manual dispatch)
├─ services/live-quiz/      (Phase 9) optional
├─ docker/                  Dockerfile (multi-stage → nginx-unprivileged), nginx.conf (security headers), compose.yaml
└─ LICENSE (Apache-2.0 code), LICENSE-CONTENT (CC BY 4.0), THIRD_PARTY_NOTICES.md,
   docs/{ARCHITECTURE,AUTHORING,CURRICULUM,EXTENDING,DEPLOY}.md
```
- Internal packages need no build step: `"exports": {".": "./src/index.ts"}`, `moduleResolution: bundler`, `tsc --noEmit` per package.
- There is one root Vitest config using `test.projects`.
- **Dependency rule (enforced with `eslint-plugin-boundaries` or dependency-cruiser):**
  - `core` ← `primitives` ← `protocols`.
  - `core` ← `derivers`.
  - `core` + `viz` ← `views`.
  - `apps/web` depends on everything.
  - Plugins never import each other's internals. They import only `core` interfaces, and other plugins only through the registry.

## 2. Core contracts
```ts
// engine — generic, typed regions; deterministic (no Date/Math.random; seeded DRBG injected)
interface RegionSpec<R extends string> { id: R; labelKey: string; elem: 'u8'|'u16'|'u32'|'u64'|'i16';
  shape: number[]; order?: 'row-major'|'col-major'; endian?: 'le'|'be' }       // SHA-512 u64, ML-KEM i16 mod q
type I18nRef = { key: string; params?: Record<string, string|number> };      // engine never emits prose
type Write<R> = { region: R; offset: number; values: ArrayLike<number> };
type TraceEvent<R, Op> = Op & { scope: number[] /* block>round>op */; writes: Write<R>[];
  highlights: Highlight<R>[]; narration: I18nRef; src?: { listing: string; line: number } } // spec pseudocode, not TS lines
// Op = discriminated union per algorithm, e.g. {op:'shiftRows', moves} | {op:'subBytes'} | {op:'mixColumn', col}
interface Trace<R, Op> { schemaVersion: 1; algorithm: string; algVersion: number; regions: RegionSpec<R>[];
  events: TraceEvent<R, Op>[]; keyframes: Map<number, Snapshot<R>> /* every K=32 */; output; truncated?: boolean }
// stateAt(trace, i) = nearest keyframe + replay deltas (LRU cache); unchanged regions share references
interface Tracer { emit(e): void; enabled: boolean; scope?: ScopeFilter }   // Null / Recording / Scoped (lazy drill-down)
interface AlgorithmModule<P, R, Op> { meta: {id; family; version; titleKey; refs; educationalOnly: true};
  params: Schema<P> /* zod-mini/valibot */; defaults: P; presets: {id; labelKey; params: P}[];
  run(p: P, t?: Tracer): { ok: true; trace: Trace<R, Op> } | { ok: false; error: I18nRef } }
// memory-model
type Triple = 'x86_64-linux-gnu'|'aarch64-linux-gnu'|'x86_64-windows-msvc'|'riscv64-linux-gnu'; // P1: first two
interface StructLayout { name; impl: 'c-ref'|'aesni'|'armv8'|'vpaes'|…; source:{lib;version;path;line}; triple; size; align; fields }
```
- **Hardware views are derived, not engine code.** `HwAdapter` maps the op sequence to registers. For example, `aesenc` = SubBytes+ShiftRows+MixColumns+AddRoundKey. AES-NI and ARMv8 CE are views with an open `isa` union.
- **Deep links** encode `{v, alg, algVersion, params, seed, step}` in the URL **hash**: keys never reach the CDN or logs. The hash is written with debounced `replaceState` and capped at 2 KB. Traces are never put in the URL.

## 2b. Extensibility architecture: Producers → Facets → Views
Goal: adding a **new algorithm, protocol, view, hardware ISA, ABI or attack** means adding one folder plus one registry line. No edits to core or to other plugins are needed (open/closed).

```
   Producer plugins                Deriver plugins                        View plugins
 (primitive | protocol |   ──►  (trace → extra facets, lazily)   ──►  (require facets → render)
  recorded-trace importer)       isa-x86, isa-armv8, memory/ABI,        state, instructions, registers,
        │ emits base facets       packets, filesystem, derivation…       memory, packets, filesystem…
        └──────────────── one Trace with a shared timeline + ValueRef registry ───────────────┘
```

### Facets: typed, versioned data channels on a shared timeline
A trace is a bundle of **facets**. Each facet has a JSON schema in `core/facets/`, and each facet step is tied to the same global step index. Views only ever consume facets, never algorithm internals. Planned facets:

| Facet | Content | First producer/deriver |
|---|---|---|
| `state` | typed regions + deltas (current design) | every primitive |
| `values` | **ValueRef registry**: `{id, labelKey, role: key\|nonce\|plaintext\|ciphertext\|secret\|public\|constant, bytes, createdAt, destroyedAt?}` | every producer |
| `instructions` | `{isa, pc, mnemonic, operands, reads[], writes[] (reg/mem refs), srcRef}` per step | `isa-x86` / `isa-armv8` derivers (AES-NI, ARMv8 CE in P1) |
| `registers` | register-file snapshots/deltas (GPR + SIMD lanes) | same ISA derivers |
| `memory` | address spaces (stack/heap/.rodata), allocations `{addr, size, layoutRef, valueRef}`, writes per step, lifetime (alloc/zeroize/free) | `memory` deriver (ABI × impl struct layouts) |
| `derivation` | DAG of values (HKDF/TLS key schedule, ratchets) | KDF primitives, protocols |
| `messages` | party lanes + messages (for sequence diagrams) | protocols |
| `packets` | frames with a layered dissection tree (Ethernet/IP/UDP/TCP → TLS record/WireGuard/SSH), direction, timestamp → AnnotatedBytes; **pcapng + SSLKEYLOGFILE export** to open in Wireshark | `packets` deriver from `messages` (Phase 7) |
| `filesystem` | virtual FS tree with file changes per step (keylog file, PEM certs, `wg0.conf`, `known_hosts`, `/proc/<pid>/maps`) | protocols / secrets-in-memory lab (Phase 7/8) |
| `math` | equations / GF and polynomial terms per step | primitives (optional) |

- **Linked brushing via ValueRef.** Every byte range in any facet can point to a `ValueRef` id. Hovering `client_handshake_traffic_secret` in the derivation tree highlights it at the same moment:
  - in RAM (memory view)
  - in the instruction operands
  - in the keylog file (filesystem view)
  - in the packet it decrypts (packets view)

  This is the backbone that makes "see the instruction AND the memory" work together.
- **Derivers run lazily.** A deriver is computed only when a mounted view needs its facet, and the result is memoised per trace.
- **Same facet, multiple sources.** The memory facet can come from the *modeled* deriver now, and later from a **recorded-trace importer**: JSON produced by real executions such as lldb/Frida/QEMU/Unicorn runs of OpenSSL, which ties into keys-in-flux, friTap and CipherForgeDev. Views don't care which source produced it. The facet JSON schemas are published in `docs/` so external tools can emit CryVenture traces.

### Plugin contracts (sketch)
```ts
// core/registry.ts — each plugin folder exports one manifest.ts (imports core types only); registries are populated via
// import.meta.glob('./*/manifest.ts', {eager:true}); implementations load via dynamic import() → per-plugin code splitting.
definePrimitive({ id: 'aes', apiVersion: 1, family: 'block-cipher', implements: ['BlockCipher'],
  titleKey, refs, params, presets, vectors: './vectors/*.json', i18n: './i18n',   // en/de live inside the plugin
  facets: ['state','values','math'], load: () => import('./aes') });
defineProtocol({ id: 'tls13', apiVersion: 1, parties: ['client','server'], suites: ['TLS_AES_128_GCM_SHA256', …],
  uses: { aead: 'Aead', kdf: 'Kdf', kex: 'Kem|Group', sig: 'Signature' },        // resolved by registry id at runtime
  facets: ['messages','derivation','values'], load: () => import('./tls13') });
defineDeriver({ id: 'isa-x86-aesni', from: { facets: ['state'], families: ['block-cipher:aes'] },
  provides: ['instructions','registers'], load: … });
defineView({ id: 'memory', titleKey, icon, requires: ['memory'], optional: ['values','instructions'],
  lenses: ['engineer','cryptographer'], defaultSlot: 'right', load: () => import('./MemoryView') });
```
- **Views appear automatically.** A lab offers every registered view whose `requires` facets are available, either directly or through a deriver. When a "Network packets" view is added later, every protocol that yields `messages` gets it automatically (via the packets deriver).
- **Workspace.** A lab is a dockable workspace using `dockview` (MIT) or `react-resizable-panels` (MIT): tabs/splits, saved per lab in localStorage, with **workspace presets** chosen per lesson. Example: `<Lab id="aes-128" preset="fips197-c1" layout="instructions|memory" />` shows Instructions and Memory side by side, synced on one playhead.

### Composable primitives: new methods are cheap, DH variants are compositions
- **Ports in `core/primitives.ts`:** `BlockCipher`, `StreamCipher`, `Aead`, `Hash`, `Mac`, `Prf`, `Kdf`, `Group` (FFDH / short-Weierstrass / Montgomery / Edwards all implement `scalarMul`, `identity`, `order`), `Kem`, `Signature`.
- **Combinators turn primitives into new primitives:**
  - `Mode(BlockCipher) → Cipher/Aead` (ECB/CBC/CTR/GCM/IGE…)
  - `HMAC(Hash) → Mac`
  - `HKDF(Mac) → Kdf`
  - `TLS12PRF(Mac) → Prf`
  - `DHKEM(Group, Kdf) → Kem`
  - `Hybrid(KemA, KemB, order, combiner) → Kem` (X25519MLKEM768 and others; the "spot the order" quiz falls out for free)
  - `NoisePattern(Group, Aead, Hash)` → IK/XX/… handshakes
- **Suites are registry ids** such as `aes-256-gcm`, `hkdf-sha384`, `x25519`, `mlkem768`. "All the DH variations" become data: group × pattern (static/ephemeral/X3DH/PQXDH/Noise es-se-ee-ss/MQV), not new code paths.
- **Nested traces (zoomable).** A combinator call opens a **child trace** via a scoped tracer. Child traces are lazily recomputed on drill-down and are deterministic. A learner can zoom TLS 1.3 → HKDF-Expand-Label → HMAC-SHA384 → one SHA-512 compression round, which is exactly the "PRF/HKDF via SHA-384 internals" path.
- **Protocol plugins are state machines.** They take parties × steps, call primitives only through ports, and emit `messages`/`derivation`/`values`. Mallory hooks (`intercept`, `modify`, `replay`, `downgrade`) are a standard protocol-runner feature, so Break-it labs reuse them across protocols.
- **Attack plugins:** `defineAttack({ targets: ['cbc'], oracle, worker: true })` uses the same registry pattern.

### Stress-tested rules (from walking through Camellia, packets, filesystem, RISC-V/Win64, Double Ratchet, recorded traces, the X25519MLKEM768 hybrid, and a fork contributor)
- **`TraceBundle` is the single trace type:**
  ```ts
  { schemaVersion,
    producer: {kind:'primitive'|'protocol'|'composite'|'import', id, apiVersion},
    provenance: 'modeled'|'recorded',
    facets: Record<`${kind}@${variant}`, Facet>,
    children }
  ```
  - The old `Trace` becomes the `state` facet.
  - Everything is JSON-serializable: keyframes are an array, not a Map. Addresses are hex strings or bigint.
- **Time is hierarchical.**
  - A step position is a scope path (`number[]`), not a flat integer.
  - Every facet has its own timeline plus `align: facetStep → parentStep`. For example, one AESENC covers 4 AES ops, RISC-V `aes64es` works on half-states, and ratchets nest.
  - The Timeline UI can collapse and zoom per scope level, and the zoom path goes in the deep link.
- **Facet variants.** Facets are keyed like `memory@x86_64-linux-gnu`, `instructions@riscv64-zkn` or `memory@recorded`. A view picks a variant, so a modeled-vs-recorded diff comes for free.
- **ValueRef ids are path-derived** (`scopePath/name`). They stay stable when a child trace is lazily recomputed, so linked brushing survives zooming.
- **Targets and ISAs are data, not core unions.**
  - `defineTarget({triple, dataModel: LP64|LLP64, ptrSize, endian, abi})`.
  - Register files come from a `RegisterFileSpec` inside the instructions facet; there are no hardcoded xmm/v lanes.
  - Struct layouts are keyed by impl × target. Any cipher without a real layout gets a generic, clearly labelled "modeled contiguous key schedule".
- **Honest promise.** Producers, derivers, views, targets and composites need **no core diff**. A brand-new facet kind is one additive schema file in core.
- **Loading:**
  - Each package has a manifest glob: `import.meta.glob('./*/manifest.ts', {eager: true})`. There is no hand-maintained index, so forks avoid merge conflicts.
  - Vitest, the contract tests and `getStaticPaths` all use the same glob.
  - A lint rule says `manifest.ts` imports only core types. Implementations load only via `load: () => import()`, which keeps code splitting.
  - Producers have no DOM imports, so they can load inside a worker.
- **The `<Lab>` island:**
  - The `.astro` wrapper server-renders a static poster: title, params and first frame as text.
  - The island uses `client:visible` and recomputes the trace on the client from params. This is safe because the engine is deterministic.
  - Lazy views are not server-rendered and no trace JSON is embedded in pages. This replaces the earlier "compute during SSR then hydrate" idea.
  - Lab routes are generated only for registered presets and composites, never for the full combinator product.
- **`ViewProps` contract in core:**
  ```ts
  { useFacet(kind, variant?) → {status, data}   // derivers run lazily, with a loading state
    playhead, selection /* hovered ValueRef / byte range bus */, t, lens }
  ```
- **Choreography** is an optional export of the producer plugin. Any cipher without one (e.g. Camellia) falls back to a generic "flash written cells" animation. Scene-node ids are `valueRef:byteIndex`.
- **Composition details:**
  - Ports carry metadata (`blockSize`, `keySizes`), and combinators have an `accepts` predicate (GCM needs a 16-byte block).
  - Composite ids use a grammar such as `gcm(camellia-128)`.
  - `defineComposite({id: 'x25519mlkem768', expr, codepoint: 0x11EC, vectors})` makes composites data that get the contract tests.
  - `GroupAsKem(Group)` provides raw DH. This is distinct from DHKEM (RFC 9180), which hashes, and the TLS hybrid needs the raw form.
  - Hybrid options are `{order: 'mlkem-first', combiner: 'concat'|'xwing'}`.
- **Packets and filesystem:**
  - `messages` carry `wireBytes` and `protectedBy: ValueRef`.
  - Protocols declare `wire: {transport, port, dissect}`.
  - Filesystem changes come from a deriver that combines `values` with a per-protocol `artifacts(trace) → FileChange[]` hook.
  - `defineExporter({from: ['packets']})` writes pcapng with a Decryption Secrets Block: a TLS keylog for TLS, the WireGuard keylog format for WireGuard.
  - Timestamps come from a seeded synthetic clock.
- **Recorded traces:** an importer is a producer with `kind: 'import'`. It is client-only, parsed in a worker, zod-validated and size-capped; its deep link is marked "not shareable". A value-matcher deriver recovers ValueRefs by byte search.
- **Cut for now (YAGNI):**
  - dockview: start with `react-resizable-panels` + tabs, versioned saved layouts that reset on mismatch
  - the `defineAttack` registry and the standard Mallory hooks, until a second protocol needs them
  - cross-view fly transitions beyond AES

### Making extension safe and fast
- **Contract-test kit** (`tools/contract-tests`). Every registered plugin automatically gets:
  - For primitives:
    - vector conformance from its `vectors/`
    - roundtrip / oracle property tests
    - determinism
    - Null == Recording tracer
    - facet JSON-schema validation
    - every emitted `I18nRef` key existing in EN and DE
  - For views: rendering against fixture traces for each required facet, axe a11y, and a reduced-motion snapshot.
  - For derivers: output schema validity, plus golden fixtures.
  - For everything:
    - every **declared** key (`titleKey`, preset and region `labelKey`s) exists in EN and DE under `plugin.<id>.*`
    - a warning when a DE value is identical to its EN value
    - `align` maps are monotonic
    - ValueRef ids are stable across recompute
    - each composite's expansion matches its vectors
- A fork contributor touches only `packages/<kind>/<id>/{manifest.ts, impl.ts, i18n/{en,de}.json, vectors/, *.test.ts}` plus an optional EN/DE MDX pair.
- **Scaffolder** (`pnpm cv new <primitive|protocol|view|deriver|attack|lesson> <id>`). It generates the folder, manifest, i18n stubs in **both EN and DE**, vector placeholders, tests, an MDX lesson pair, and the registry line.
- **`docs/EXTENDING.md`** gives one worked example per extension type (e.g. "add Camellia in 30 minutes", "add a filesystem view").
- **Catalog pages are generated from the registries:** the Labs index, constants gallery, Cryptopia map and sidebar badges. New plugins show up without content edits.
- **Version fields:** `apiVersion` on manifests and `schemaVersion` on facets, with migration functions for persisted workspaces and deep links.

### Time model, choreography, scene graph (viz)
- **The playhead is continuous:** `t = stepIndex + progress`, stored in one Motion `MotionValue`. Views derive positions and colors via `useTransform`.
  - Play = `animate(playhead, target)`; seek = `playhead.set()`. Both are exact and reversible.
  - No `layoutId` for scrubbable moves.
- **`Choreography`:** a pure function `(prevState, event, layout) → Track[]`, where a track is `{target, prop, keyframes[{at, value, ease}]}` plus `beats[{at, narrationKey, camera?}]`. It gives sub-animations within one step. Examples:
  - MixColumns runs column by column, then each `02·a⊕03·b⊕c⊕d`, then the xtime carry.
  - ShiftRows sweeps row by row.
  - KeyExpansion: RotWord → SubWord → ⊕Rcon → ⊕w[i−4].
- **Scene graph:** nodes `{id, kind: byte|word|wire|opGlyph, region, index}` with stable identity across views. This enables cross-view "fly" transitions (matrix → xmm0 lanes → `AES_KEY.rd_key` in RAM).
  - The camera is an SVG viewBox track (focus/zoom). It has a "follow camera" toggle.
- **Two modes, one player:**
  - **Story/Cinematic:** a lesson scene list of trace ranges plus choreography presets, narrated and auto-advancing; the Rijndael-v4 feel.
  - **Debugger:** step/scrub; step into/over (round→op→byte); breakpoints on op/round; a watch panel tracking one byte across the trace; "guess, then step" prediction prompts.
- **State per island:** one zustand store per lab instance, provided through React context. Nanostores hold only page-wide preferences: reduced motion, lens, progress.

## 3. Visual design system (`packages/viz/design-system`, documented in AUTHORING.md)
- **Semantic tokens `--cv-*`.** Every token also has a glyph or pattern, so it is safe for colour-blind readers; a validator checks contrast.

  | Meaning | Colour | Glyph / pattern |
  |---|---|---|
  | Key/secret | amber | key glyph, filled |
  | Round/sub keys | light amber | |
  | Plaintext | blue | |
  | Ciphertext | violet | |
  | State | slate | |
  | Constants | teal | π glyph |
  | Nonce/IV/randomness | magenta | dice glyph |
  | Public values | outlined | |
  | Attacker (Eve/Mallory) | red | hatched |
  | Error | red | |
- **Op glyphs** (SVG sprites, each with a fixed micro-animation): ⊕ XOR, S-box "slot machine", ⟲ rotate, ⊗ GF-mul, ⊞ mod-add carry ripple, shifts, ‖ concat, H() funnel, KDF split, NTT butterfly.
- **Primitives:**
  - `ByteCell` / `ByteGrid` / `StateMatrix`
  - `Lanes` (SIMD, with 16×8 / 4×32 / 2×64 reinterpretation)
  - `Wire` (animated data flow; thickness ∝ bits)
  - `AnnotatedBytes` (xargs-style; nested hover groups; copy as hex/C/Python)
  - `SequenceDiagram`
  - `DerivationTree` (key schedule / HKDF / TLS 1.3 secrets)
  - `Histogram` / `Heatmap`
  - `HexMemoryView` + `FieldOverlay` (address ruler, padding as hatched "air", sizeof/alignof counters)
- **One hex formatting everywhere:** grouping, offset gutter, endianness badge.

## 4. Lesson anatomy & learner journey
- **Six `<LessonSection>` parts:**
  1. Concept (≤150 words per section, plus a "why" box for constants)
  2. Playground (zod-generated ParamPanel with tolerant hex/ASCII input and inline i18n errors; presets from the test vectors; "Diff two runs" side by side)
  3. Inside (player)
  4. Memory & Hardware
  5. Break it (Mallory's quest)
  6. Check (quiz; later FSRS "predict the byte" cards and a challenge)
- **Lens switch:** Story (round-level, no hex) / Engineer (op-level + hex + memory) / Cryptographer (byte/bit, GF math). Content uses `<Lens level>` in MDX.
- **Layout:** labs break out of the narrow Starlight column via `Breakout`; `tableOfContents: false` on lab-heavy pages. Each lesson page has a sticky mini-player and a section rail.
- **"Cryptopia" world map:** each track is a region (Foundations Village, Block-Cipher Citadel, Stream Rapids, Hash Forge, Curve Mountains, Post-Quantum Frontier, Protocol Harbor, Memory Caves).
  - Prerequisites are soft, shown as "requires" badges in the sidebar, generated from the prerequisite graph (§6).
  - The cast is Alice/Bob/Eve/Mallory/Trent.
- **Onboarding:** a 90-second prologue (XOR a note so Eve sees noise), then self-placement to set the default lens.
- **Home page:**
  - A live, scrubbable cinematic AES round in the hero, with your own plaintext. Calls to action: Start adventure / Jump to a lab / Teach a class.
  - A map, a rotating "Break something today" item, and a "verified against FIPS/RFC vectors" strip.
- **Information architecture:** Learn · Labs (filterable index) · Challenges · Reference (glossary, constants gallery, vector browser, protocol dissections), plus a ⌘K command palette and glossary hover previews.
- **Classroom:** a static fullscreen presentation mode (cinematic, keyboard-driven) is available early. The live quiz comes in Phase 9.

## 5. i18n (EN + DE)
- **Content:** Starlight `locales {en, de}`, content in `docs/{en,de}/`. CI fails if a page exists in only one locale.
- **Staleness check:** DE frontmatter stores the EN `sourceHash`, and CI flags stale translations.
- **Starlight UI strings:** `src/content/i18n/*.json` via `i18nSchema` (`Astro.locals.t`).
- **Labs:** the `.astro` wrapper passes only the needed namespaces of the current locale as a `messages` prop. The island uses a tiny typed `t(key, params)`; no i18next is bundled.
  - Key types are generated.
  - A parity script fails CI on missing, extra or empty keys, or mismatched `{{params}}`.
  - The ESLint `no-literal-string` rule applies to JSX.
  - Plural forms: `<key>_one` / `<key>_other` (optional `_zero`), chosen by `Intl.PluralRules` of the page locale when `params.count` is a number.
- **German style:** term base and style guide in `docs/GLOSSARY.md`; `pnpm i18n:check` lints DE catalogs and pages (quotes, du-form, glossary terms, abbreviations). DE pages carry `translation.status` (`ai-reviewed` → `human-reviewed`).
- **Language switch:** the `LanguageSelect` override carries `location.hash`, so switching EN↔DE keeps the lab state.
- **Search:** Pagefind indexes per `<html lang>`. Lab islands get `data-pagefind-ignore`.

## 6. Curriculum (full detail → `docs/CURRICULUM.md`; prerequisite graph drives the sidebar)

**Prerequisite graph:**
- Bits/XOR/endianness → GF(2^8) → AES → ECB/CBC/CTR → GF(2^128) → GHASH/GCM → CMAC/XTS/SIV/POLYVAL
- Modular arithmetic → Poly1305 → ChaCha20-Poly1305
- SHA-2/Keccak/BLAKE2 → HMAC → PRF/HKDF/PBKDF2 → DRBG
- Number theory → FFDH → EC group law → ECDH/X25519 → signatures → X.509
- Polynomial rings + NTT + SHAKE → LWE → ML-KEM/ML-DSA; hash trees → SLH-DSA/LMS
- HKDF + AEAD + ECDHE + signatures + X.509 → TLS 1.2 → TLS 1.3 → PQ-TLS/ECH
- Noise + BLAKE2s + X25519 + ChaCha20-Poly1305 → WireGuard
- X3DH + HKDF → Double Ratchet → PQXDH → SPQR
- IGE + SHA-256 + FFDH + RSA → MTProto

| Phase | Content |
|---|---|
| **1 AES + modes (MVP)** | Foundations (XOR, endianness, GF(2^8)); AES-128/192/256 complete; S-box derivation; KeyExpansion; ECB/CBC+PKCS#7/CTR/GCM+GHASH (spec right-shift algorithm, R=0xE1; J0 rule for non-96-bit IVs; GMAC; truncated tags); AES-NI + ARMv8 CE views; memory/ABI; T11 Security notions intro (IND-CPA game, birthday bound) |
| 2a Hash | MD5/SHA-1 (historical), SHA-224/256/384/512, SHA-512/t, **Keccak/SHA-3/SHAKE/cSHAKE** (moved earlier: PQC needs it), BLAKE2s/2b; SHA-NI, ARMv8.2 SHA-512/SHA3 |
| 2b MAC/KDF/RNG | HMAC (SHA-384: 128-byte block, HashLen 48), CMAC, KMAC; TLS 1.0 PRF (MD5⊕SHA1), TLS 1.2 PRF (P_SHA256; P_SHA384 only for RFC 5289 suites), EMS (RFC 7627); HKDF, Expand-Label, SSH KDF, SP 800-108/56C, PBKDF2, scrypt, Argon2id; DRBGs (HMAC/Hash/CTR), Linux RNG, RDRAND, Debian OpenSSL bug |
| 3 Stream | RC4 KSA/PRGA + biases + WEP FMS/PTW; Salsa20/ChaCha20 (RFC 8439 vs DJB counter split), XChaCha, Poly1305 (2^130−5, r-clamp), ChaCha20-Poly1305; optional Ascon (SP 800-232) |
| 4 DES & modes II | Feistel framework, DES/3DES (constants: IP/FP, E, P, PC-1/2, shifts, S-box criteria); CFB, OFB, **AES-IGE**, XTS+ciphertext stealing, CCM, OCB3, AES-SIV, GCM-SIV/POLYVAL, AES-KW/KWP, key commitment; PCLMULQDQ GHASH (Karatsuba), T-tables + cache timing, bitslicing, vpaes |
| 5a Number theory | groups, order, generators, extended Euclid, CRT, square-and-multiply, BSGS/ρ/Pohlig–Hellman, EC group law, projective/Jacobian, Montgomery form |
| 5b Key exchange | FFDH (RFC 7919 FFDHE, RFC 3526 MODP), ECDHE vs static ECDH, X25519/X448 ladder, MQV/ECMQV/HMQV, X3DH, Noise patterns (es/se/ee/ss), ElGamal, ECIES, DHKEM/HPKE (RFC 9180), PAKEs (SRP, SPAKE2, CPace, OPAQUE, SAE/Dragonfly), CSIDH + SIDH/SIKE (broken case study) |
| 5c Signatures/PKI | RSA (PKCS#1 v1.5, PSS), ECDSA (RFC 6979), EdDSA, XEdDSA, Schnorr, X.509/ASN.1 DER, chains, CT |
| 6 PQC | lattice intro (LWE→RLWE→MLWE); **ML-KEM flagship** (incomplete NTT q=3329 ζ=17, CBD, compression, FO transform, G(d‖k) domain separation); NTRU/sntrup761; overview of FrodoKEM/McEliece/HQC; X-Wing; ML-DSA (complete NTT q=8380417 ζ=1753); FN-DSA overview; SLH-DSA; LMS/XMSS |
| 7 Protocols | TLS 1.2 → TLS 1.3 (RFC 8448 + live key schedule, PSK/0-RTT) → PQ-TLS (X25519MLKEM768 0x11EC: **ML-KEM share first**, ss_MLKEM‖ss_X25519; 0x11EB/P-384 hybrids put ECDH first; old 0x6399 put X25519 first → "spot the order" quiz) → ECH → SSH (chacha20-poly1305@openssh, sntrup761x25519-sha512, mlkem768x25519-sha256, K as string; Terrapin) → Noise → WireGuard (BLAKE2s, cookies) → Signal (X3DH → Double Ratchet → PQXDH → SPQR/Triple Ratchet) → MTProto 2.0 |
| 8 Secrets in memory | the 14-library key handover map (keys-in-flux), key lifetime timeline, zeroization, cold-boot decay, the qemu dump oracle matrix (impl × triple), Spectre/secret lifetime, HSM/TPM/enclaves, ARM DIT / Intel DOITM |
| 9 Gamification | ts-fsrs cards, CTF challenges (offline-verified flag hashes, 3-hint ladder, weekly "boss"), skill badges, driver.js tours, `services/live-quiz` (Razzia-inspired Socket.IO; "scrub to the step where…" question type) |
| 10 Extensions | QUIC, DTLS 1.3, IPsec/IKEv2 (+RFC 9370), MLS/TreeKEM, OpenPGP RFC 9580, age, Kerberos, Tor ntor, Olm/Megolm, iMessage PQ3, KEMTLS, WPA2/KRACK, WPA3-SAE, BLE, 5G SUCI |

- **Constants & why:** each lesson gets an interactive derivation. The full list goes in CURRICULUM.md. Examples:
  - AES: 0x11B, 0x63, MDS {02,03,01,01}, Rcon
  - SHA-2: √/∛ of primes, the SHA-384 IV, SHA-512/t IV generation
  - Keccak: LFSR round constants
  - HMAC: ipad/opad
  - ChaCha: "expand 32-byte k"
  - Curve25519: A=486662, a24
  - P-256: the seed debate
  - FFDHE: digits of e
  - ML-KEM: q=3329, Montgomery/Barrett constants
  - TLS: "tls13 " label, HRR random, DOWNGRD
  - WireGuard: construction strings
- **Playground ideas:**
  - AES rounds 1–14 with an avalanche heatmap; S-box swap (identity/affine/random) leading to a linear attack; remove ShiftRows/MixColumns; zero Rcon
  - IV/nonce reuse toggles; CBC/CTR bit-flip editor; GCM tag-length vs forgery odds
  - RC4 key length and drop-N with the bias histogram converging
  - ChaCha rounds 2–20; corrupting its constant
  - Reduced-round SHA; length extension vs HMAC
  - Smooth p leading to Pohlig–Hellman; a curve editor (singular curves break)
  - ML-KEM η/du/dv vs failure probability and ciphertext size; NTT-off op counter; FO-off
  - Ephemeral vs static key for forward secrecy
- **Break-it labs** all run in a Web Worker against an in-page oracle with toy parameters and make no network calls. Each phase picks from:
  - AES: integral attack, DFA, synthetic CPA/power traces, cache timing, cold boot
  - Modes: ECB byte-at-a-time, padding oracle, CBC bit-flip, BEAST concept, CTR crib-dragging, GCM nonce reuse → H → forgery
  - DES: weak keys, 2DES meet-in-the-middle, Sweet32 toy
  - RC4/WEP
  - Hashes: length extension, multicollisions
  - DH/EC: small subgroup, Logjam toy, invalid curve, X25519 low-order points, Dual_EC toy
  - RSA: Håstad, Wiener, Bellcore, batch-GCD, Bleichenbacher-512
  - Signatures: ECDSA nonce reuse/bias
  - PQ: toy LWE vs LLL, KyberSlash sim, FO-off, WOTS+ reuse
  - Protocols: Terrapin, downgrade, 0-RTT replay, triple handshake, KRACK

## 7. Phase 0/1 delivered as milestones (walking skeleton first)
- **M0 Walking skeleton:**
  - pnpm workspace, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), eslint (i18n `no-literal-string`; `max-lines-per-function` warn at 20 per user guideline, `.tsx` exempt), prettier, `.nvmrc` (Node 22).
  - Starlight EN/DE with one MDX page each; tokens.css + starlight-tailwind (cascade layers: base, starlight, theme, components, utilities; no preflight).
  - **Plugin spine first:**
    - `core` registries, facet types for `state`, `values` and `narration`
    - `definePrimitive` / `defineView`
    - the generic `<Lab>` island with a 2-panel workspace
  - Then the first plugins:
    - `primitives/aes` showing only round 1 AddRoundKey+SubBytes for FIPS 197 C.1
    - the `views/state` and `views/narration` plugins, plus Timeline
    - messages passed as props, and the hash deep link
  - **Contract-test kit v0** and `pnpm cv new` scaffolder v0, proven by generating the `views/narration` plugin with it.
  - CI (`.github/workflows/ci.yml`): lint (incl. boundaries) → typecheck → i18n parity → vitest (+contract tests) → build → 1 Playwright test.
  - **Deploy to GitHub Pages** (`pages.yml`), and build the Docker image (see §7b).
- **M1 Full AES:**
  - plugin `primitives/aes/` (shared `core/math/gf256`): `gf256`, `sbox` (traced inverse→affine), `state`, `subBytes`, `shiftRows`, `mixColumns`, `addRoundKey`, `keyExpansion` (128/192/256), `cipher`, `invCipher`, `aesModule`.
  - Delta + keyframe store, `stateAt`.
  - viz: choreography for each AES op, Story + Debugger modes, KeyScheduleTree, Controls (←/→/Space/Home/End scoped to the focused lab).
  - FIPS 197 App. A/B/C per-round conformance + noble property tests.
  - Lessons `symmetric/aes/{index,shiftrows-mixcolumns,key-expansion}`.
- **M2 Foundations + S-box:**
  - Lessons `foundations/{xor,endianness,gf256}`; SBoxExplorer, GF256Calculator, S-box derivation lesson.
  - Quiz island + progress (`cv.progress.v1`, migrations, JSON export/import); prologue onboarding; Lens switch.
- **M3 Modes I:**
  - mode plugins `primitives/{ecb,cbc,ctr}` (+ `core/padding/pkcs7`) as `Mode(BlockCipher)` combinators; ModeChain + Wire.
  - PenguinLab (worker, image upload); padding-oracle, CBC bit-flip and CTR reuse labs.
  - SP 800-38A vectors; PWA (`navigateFallback: null`, Pagefind in the precache, prompt-to-reload).
- **M4 GCM + Memory & Hardware:**
  - `primitives/{ghash,gcm}` + `attacks/gcm-nonce-reuse`; GCM spec + Wycheproof vectors.
  - Memory view for x86_64-linux + aarch64-linux, `AES_KEY` as **impl × triple** (c-ref stores host-endian u32 words; aesni/armv8 store raw byte order, and the rounds field may differ), with hand-verified `bind()` tests. LLP64 is taught with a dedicated probe struct, because `AES_KEY` has no `long`.
  - Fly-through animation (matrix → xmm0 → RAM); endianness flip toggle.
  - ISA derivers (`derivers/isa-x86`, `derivers/isa-armv8`): AESENC (ShiftRows→SubBytes→MixColumns→⊕k) vs AESE (⊕k→SubBytes/ShiftRows) + AESMC with a final EOR; fusion note.
  - Precomputed asm JSON (`_mm_aesenc_si128`, `vaeseq_u8`, pinned clang -O2).
  - Lessons `aes/{memory-abi,aes-ni}`, `modes/{gcm,ghash}`; hero lab on the home page.
  - a11y + visual gates; `THIRD_PARTY_NOTICES.md`; CSP (meta tag on Pages, real headers in Docker).
  - **Extensibility proof:** in M4 the Instructions, Registers and Memory views arrive purely as plugins:
    - `derivers/isa-x86`, `derivers/isa-armv8` and `derivers/memory`
    - `views/instructions`, `views/registers` and `views/memory`
    - a lesson preset with the `instructions|memory` layout

    The only change to core is adding the facet schemas. CI checks this with a "no core diff" review checklist item.
- **Deferred:** `EVP_CIPHER_CTX` (opaque in OpenSSL 3; lives in provider `algctx`) and the qemu dump oracle (both to Phase 8); riscv64/Windows triples; byte-level trace detail. The packets and filesystem facets/views come in Phase 7/8. Their schemas are drafted in M4 so the protocol design accounts for them.

## 7b. Deployment: GitHub Pages (primary) + Docker (self-host / offline classrooms)
**One build, two targets.** `astro.config.mts` reads `CV_SITE` and `CV_BASE`:
- Pages default: `https://<owner>.github.io` + `/cryventure/` (project page).
- Docker default: `/`.
- A custom domain or user page sets base `/`.

**Base-path discipline.** All internal links and assets go through a `withBase()` helper or `import.meta.env.BASE_URL`; never hardcode `/en/…`. This covers:
- the PWA `scope`/`start_url`
- Pagefind's bundle path
- the language switcher
- the generated lab routes
- the manifest icons

An ESLint rule forbids absolute `href="/…"` literals in JSX/Astro.
- MDX links are **not** rewritten for the base path. Use Starlight `slug:` sidebar entries and Astro links, and check them with `starlight-links-validator`.
- Set `trailingSlash: 'always'` + `build.format: 'directory'` so URLs behave the same on Pages and nginx.
- An explicit root `src/pages/index.astro` detects the language and sends the visitor to `en/` or `de/`.
- An E2E test runs against **both** a base-path build and a `/` build.

**GitHub Pages** (`.github/workflows/pages.yml`):
- Runs on push to `main`: `pnpm build` with `CV_BASE=/<repo>/`, then `actions/upload-pages-artifact`, then `actions/deploy-pages`. The Pages source is set to "GitHub Actions" (no `gh-pages` branch, so `.nojekyll` isn't needed).
- **404 page:** set Starlight `disable404Route` and add our own localized 404 route, emitted at the dist root (Pages serves it for project sites).
- **CSP:** Pages has no custom headers, so CSP is a `<meta http-equiv>`, generated with Astro's built-in CSP hashing (`experimental.csp`, Astro ≥ 5.9). `frame-ancestors` can't be set via meta, so we document that limitation. HTTPS comes from Pages itself.
- **PR previews:** artifact-only. CI uploads the built site, built with `CV_PWA=false`, so previews never sit inside the production service-worker scope. No `rossjrw/pr-preview-action`, since it needs a `gh-pages` branch.
- **PWA:** `scope`/`start_url` derive from `base`. `maximumFileSizeToCacheInBytes` is capped, and the Pagefind precache size is audited.
- Size budget: Pages allows ~1 GB and soft bandwidth limits. Large assets (e.g. Pyodide later) are loaded lazily from the same origin, with a CI warning when the site exceeds 200 MB.

**Docker** (`docker/Dockerfile`, multi-stage):
1. A `node:22-alpine` stage with `--platform=$BUILDPLATFORM` builds once, natively, with no QEMU. It runs `corepack pnpm install --frozen-lockfile` and `pnpm build` with `CV_BASE=/`. The build arg `CV_BASE` allows a sub-path behind a reverse proxy; `dist` is then copied into `html/<base>/`.
   - `nginx.conf` and `error_page` are rendered for `CV_BASE` **at build time**, because envsubst templates can't run with a read-only root filesystem.
2. A `nginxinc/nginx-unprivileged:alpine` stage (the only per-architecture stage) copies `dist/` and serves it. It:
   - runs as non-root on port 8080, with a read-only root filesystem plus `tmpfs:/tmp`
   - uses `try_files $uri $uri/index.html =404` and `absolute_redirect off`, so the `/en`→`/en/` redirect doesn't leak `:8080`
   - sends real security headers (strict CSP, `frame-ancestors 'none'`, `Referrer-Policy no-referrer`, `X-Content-Type-Options`, `Permissions-Policy`)
   - uses gzip, long-cache immutable `_astro/*`, no-cache for the HTML and service worker
   - has `error_page 404` pointing at the localized 404, and a `/healthz` endpoint plus `HEALTHCHECK`
- **Publishing:** `.github/workflows/docker.yml` builds multi-arch (amd64 + arm64 via buildx) on tags and main, pushes to **GHCR** `ghcr.io/<owner>/cryventure:{latest,semver,sha}`, generates an SBOM + provenance (`docker/build-push-action` attestations), and runs a Trivy scan.
  - The owner name is lowercased for GHCR.
  - Workflow permissions: `packages: write`, `id-token: write`, `attestations: write`.
  - Size budgets are split: the nginx base image and `dist` are tracked separately.
- **Running it:**
  ```bash
  docker run --rm -p 8080:8080 ghcr.io/<owner>/cryventure      # → http://localhost:8080/en/
  docker compose -f docker/compose.yaml up                         # web (+ later: --profile classroom → live-quiz)
  ```
- **Offline/air-gapped classrooms:** the image is self-contained. No external fonts, CDNs or network calls at runtime.
- Docker images for the layout/asm generators live separately in `packages/tools/docker/`; they are build-time only and never shipped.
- **Container CI smoke test:**
  - build the image
  - `docker run -d`
  - `curl` `/en/`, `/de/` and `/healthz`, and check the headers
  - run the Playwright smoke suite against the container
  - check that the image size is under 60 MB
- `docs/DEPLOY.md` covers Pages setup, custom domains, Docker, reverse-proxy sub-paths and the compose classroom profile.

## 8. Testing (user rule: tests for every function + verify in the running app)
- **Unit:** Vitest on every exported function; GF and S-box tested exhaustively.
- **Conformance:** FIPS 197 per-round values must equal `stateAt` at the matching scope; SP 800-38A, GCM and Wycheproof vectors; HwAdapter xmm values must equal App. C `round[r].start`, and the ARM values `m_col`.
- **Property tests (fast-check):**
  - encrypt/decrypt roundtrip
  - output == noble
  - Null tracer == Recording tracer
  - `stateAt` (keyframe + deltas) == full replay
  - seek(t) == the final state of sequential playback
  - the URL codec roundtrips
- **Component:** Testing Library on pure adapters and choreography.
- **E2E (Playwright, on `astro preview`):**
  - step / scrub / deep-link restore
  - EN↔DE keeps the step and shows German narration (no raw `algo.`/`ui.` keys in the DOM)
  - offline reload
  - axe: 0 serious issues
- **Visual:** about 10 snapshots, run with Motion `skipAnimations` via `?test` and self-hosted fonts, in the official Playwright Docker image.
- **Performance:** `vitest bench` for `run`/`stateAt`. A nightly CDP-throttled seek benchmark and Lighthouse track trends but do not gate.

## 9. Cross-cutting
- **Accessibility:** reduced motion falls back to cross-fade with the same beats; `aria-live` narration; `role="grid"` cells; colour plus glyph.
- **Determinism:** no clock or `Math.random` in producers; a seeded DRBG and a synthetic clock are injected. Islands recompute on the client from params, with a static SSR poster (see §2b).
- **Errors:** error boundary per island with "reset lab"; a bad URL falls back to defaults with a notice.
- **Privacy:** no analytics; a "stored locally" notice.
- **CSP:** `default-src 'self'`, `wasm-unsafe-eval` (Pagefind), hashed Starlight inline script, `style-src-attr 'unsafe-inline'` for Motion. It is delivered as a meta tag on GitHub Pages and as a header in Docker/nginx, both generated from one `csp.ts` source.
- **Bundle:** `LazyMotion` + `m` + `domAnimation`; D3 submodules only; layout/asm JSON loaded with `import()` per triple.
- **Licensing:** license-checker allowlist in CI, a notices file, and an "inspiration only" list.
- **"Educational only":** enforced by the type system plus a banner on every lab.
- **Content versioning:** frontmatter `{lessonVersion, lastReviewed, specRefs[], sourceHash}`. Every claim cites an RFC/FIPS section; German text is reviewed by a native speaker.

## 10. Risks
| Risk | Mitigation |
|---|---|
| A wrong trace teaches errors | Oracle checks at every published intermediate value |
| Memory/jank on big traces | deltas + keyframes, scoped lazy traces, `maxEvents`, workers for bulk work |
| i18n drift | keys-only engine, lint rule, parity check, sourceHash staleness |
| Scope explosion | milestone gates: EN+DE complete with tests |
| Implementation-specific memory layouts | `impl × triple` model with a pinned source per layout |
| Starlight layout limits | breakout wrappers and `<StarlightPage>` routes |
| GPL contamination | license allowlist |
| Plugin API churn breaks plugins | `apiVersion` + contract-test kit; the API is frozen after M4 and changed only with migrations |
| Over-abstraction before real needs | facets/registries are built only as far as M0–M4 plugins exercise them; packets/filesystem stay schema drafts until Phase 7/8 |
| Base-path bugs on github.io | `withBase()` + lint rule; E2E against both `/cryventure/` and `/` builds |

## 11. Verification (M0–M4)
- `pnpm i && pnpm -r lint typecheck test && pnpm --filter web build` passes. Removing one DE key makes `pnpm i18n:check` fail.
- `pnpm --filter web preview`: `/en/` and `/de/` render, the theme toggle works, the service worker is active, offline reload works (from M3).
- Engine:
  - FIPS 197 per-round values match.
  - SP 800-38A / GCM / Wycheproof pass.
  - fast-check vs noble passes.
  - Trace-engine coverage ≥ 90%.
- **Playwright on the running app**, AES lab with the FIPS key and plaintext:
  - Round 1 SubBytes == App. C.1.
  - Final ciphertext `69c4e0d86a7b0430d8cdb78070b4c55a`.
  - A 1-bit flip gives ~64-bit avalanche by round 2.
  - Story mode plays MixColumns column by column, and scrubbing backwards is exact.
  - Triple/impl switch updates offsets and byte order.
  - The AES-NI view's xmm values match each round's start state.
  - Penguin visible under ECB, noise under CBC; the GCM tag matches; nonce reuse recovers H.
  - Switching EN→DE mid-lab keeps the step and shows German narration.
  - Reloading the deep link restores the step.
  - axe and visual tests pass.
- **Deployment:**
  - The `pages.yml` run deploys to `https://<owner>.github.io/cryventure/`. Playwright smoke runs against the live URL: `/cryventure/en/`, `/cryventure/de/`, a lab deep link and the PWA scope.
  - `docker build -f docker/Dockerfile -t cryventure . && docker run -p 8080:8080 cryventure` serves `/en/` and `/de/`, `/healthz` returns 200, the CSP/security headers are present, and the Playwright smoke suite passes against the container.
- **Extensibility:**
  - `pnpm cv new primitive demo-xor` + `pnpm cv new view demo-bits --requires state` produce plugins that pass the contract tests with no other edits.
  - The demo view shows up in the AES lab's view picker automatically.
  - The scaffolded output is deleted after the check.
- The user's rule "test on device" means a manual pass in Chrome via Claude-in-Chrome / Playwright screenshots after each milestone.
