# Extending CryVenture

How to add a **primitive** (an algorithm that produces a trace), a **view** (a React panel that
renders facets of a trace) or a **deriver** (extra facets computed from a finished trace). Background and the reasoning behind these rules: `docs/PLAN.md` §2b
(Producers → Facets → Views) and §5 (i18n).

## The model in one paragraph

A primitive's `run(params)` returns a JSON `TraceBundle` with typed **facets** (`state`, `values`,
`narration`, …). Views declare which facet kinds they `require`; the lab offers every view whose
requirements the producer's `facets` satisfy. Primitives never import views and views never import
primitives. Each side depends only on `@cryventure/core` contracts (views also use the
`@cryventure/viz` runtime). Engines never emit prose: they emit `I18nRef`s (`{ key, params }`) that
are translated at render time.

## Add a primitive

```sh
pnpm cv new primitive my-cipher --family block-cipher
```

This creates `packages/primitives/src/my-cipher/`:

| File | Purpose |
| --- | --- |
| `manifest.ts` | Eagerly loaded, tiny. Declares id, facets, presets, defaults, `paramFields`, `validate`, and `load: () => import('./module.ts')`. May import `@cryventure/core` only (enforced by ESLint boundaries). |
| `module.ts` | The implementation (`run(params, { tracer })`). It is code-split and loaded only when a lab starts. |
| `module.test.ts` | Unit tests for your own functions. |
| `i18n/en.json`, `i18n/de.json` | The plugin's catalogs. Every key sits under `plugin.<id>.*`. DE starts as `[DE] …` stubs. |
| `vectors/conformance.json` | Known-answer vectors in the generic format below. The starter case must be replaced by values from an independent source. |

There is no list to edit: `packages/primitives/src/index.ts` discovers `*/manifest.ts` with
`import.meta.glob`, and the contract kit (below) picks the new plugin up automatically. The
minimal `import.meta.glob` typing lives once in `types/import-meta.d.ts` and is pulled in by the
`include` of each package that discovers plugins (primitives, views, tools).

### Manifest rules

- `id` is kebab-case and unique. `apiVersion` is `1`. `i18nNamespace` is `plugin.<id>`.
- `defaults` and every preset's `params` must pass `validate()`.
- `validate()` normalises input (for example lowercase hex with separators stripped) and returns
  `{ ok: false, error: I18nRef }` instead of throwing. Hex parse errors come from core
  (`core.error.hex*`) and are already translated.
- `run()` must be deterministic (`Math.random` and `Date.now` are banned in core and primitives) and
  its bundle must be JSON-serializable.
- **`paramFields`** (optional, additive to apiVersion 1) describes the inputs for the generic param
  panel, so `apps/web` needs no algorithm knowledge:

  ```ts
  paramFields: [
    { name: 'keyHex', kind: 'hex', labelKey: 'plugin.my-cipher.param.key', hintKey: 'plugin.my-cipher.param.keyHint' },
    {
      name: 'mode',
      kind: 'select',
      labelKey: 'plugin.my-cipher.param.mode',
      options: [
        { value: 'ecb', labelKey: 'plugin.my-cipher.param.modeOption.ecb' },
        { value: 'cbc', labelKey: 'plugin.my-cipher.param.modeOption.cbc' },
      ],
    },
  ],
  ```

  Each `name` must be a key of `defaults`. Edits go through `validate()` before they are applied.
  Without `paramFields`, string defaults named `…Hex` become hex fields labelled
  `plugin.<id>.param.<name>`. `paramFieldsOf(manifest)` in core implements this fallback.
- **`ops`** (optional, additive) labels every op the module records in `StateStep.op`:
  `ops: { subBytes: { labelKey: 'plugin.my-cipher.op.subBytes', shortLabelKey: 'plugin.my-cipher.opShort.subBytes' } }`.
  `labelKey` is used in debugger pickers, `shortLabelKey` in tight spots such as the player's scope
  path ("Round 1 · SubBytes"); it falls back to `labelKey`. This declaration is the only source of
  op labels: there is no key-naming convention, and an op without an entry is shown by its raw name
  (and the scope path keeps the level's template). The keys may be named freely; the scaffold uses
  `plugin.<id>.op.<op>` / `plugin.<id>.opShort.<op>`.
- **Initial state, not a load step** (docs/M3.md §0a): the inputs a run starts from belong in the
  state facet's `initial` snapshot, not in a "load" op. Narrate them with
  `StateFacet.initialNarration` (optional, additive), e.g.
  `new RecordingTracer(regions, initial, { initialNarration: i18nRef('plugin.my-cipher.step.initial', { count }) })`.
  `narrationFromState` then emits it as the entry at step −1, and the player and narration view
  show it at the initial state (without it they show the generic `ui.narration.initial`). With
  `PairedRecorder`, pass `{ narration, math }` as its fourth argument to also get a step −1 math
  entry. Values present from the start use `createdAt: INITIAL_STEP_INDEX` (−1). The contract kit
  checks the key and its `{{params}}` in EN and DE, that the narration facet's step −1 entry matches,
  and that a step −1 math entry has an initial narration.
- **`outputs`** (optional, additive) labels the entries of `TraceBundle.output` in the lab's output
  panel: `outputs: { ciphertext: { labelKey: 'plugin.my-cipher.output.ciphertext' } }`.
- Core helpers for hex params: `parseHexOfLength(input, [16, 24, 32], { invalidType, wrongLength })`
  validates one field (non-string → `invalidType`; wrong byte count → `wrongLength` with
  `{{length}}`; hex syntax errors keep their `core.error.hex*` keys) and returns
  `HexOfLengthResult` (the bytes plus the normalised `hex`). In `run()`, `parseHexOrThrow(hex)`
  decodes hex that `validate()` already accepted. The scaffolded manifest shows both in use.

### Text params

`{ name: 'plaintext', kind: 'text', labelKey, maxLength: 48 }` is a UTF-8 string param rendered as a
text input. `maxLength` counts UTF-8 bytes, not characters. In `validate()`, use
`readText(input, maxLength)` (`undefined` = not a string or too long); `utf8Bytes(text)` in core
converts the text to bytes. The contract kit checks that `maxLength`
is a positive integer and that `defaults` and every preset fit it.

- **Hex text:** when the producer also has a sibling param named `encoding` whose value is `'hex'`,
  the lab's param panel and the contract kit measure the text field named **`input`** (the message)
  in **hex-decoded bytes** instead of UTF-8 bytes (`textFieldLength` in
  `apps/web/src/labs/paramFields.ts`, mirrored by the kit's `textFieldProblems`); every other text
  field (e.g. cSHAKE's `functionName`/`customization`) always counts UTF-8 bytes. So name the message
  field `input`, set `maxLength` to the message limit in bytes, the same for both encodings (e.g.
  `sha256`/`sha512`: 128), and decode/check the hex in `validate()` yourself.
- **Shared manifest parts (`manifestKit`):** manifests may import only `@cryventure/core`, plus their
  package's `_lib/applicability.ts` and `_lib/<group>/manifestKit.ts`. A `manifestKit.ts` is loaded
  eagerly with the manifests, so it may import **only** `@cryventure/core` (ESLint enforces both).
  Use it for param fields, presets and validation that several producers share, e.g.
  `primitives/src/_lib/sha2/manifestKit.ts`; keep the recorder behind `load()`.

### Ports and composites

A primitive never imports another primitive. A composite (a mode of operation, an attack lab) uses
another producer through a **port**, an interface in `@cryventure/core` (`ports.ts`, e.g.
`BlockCipher`):

- **Providing a port:** list it in the manifest, `implements: ['BlockCipher']`, and export it from
  the module: `export const ports = { BlockCipher: myCipher } satisfies Partial<PortMap>`. A
  `BlockCipher` throws (a `RangeError`) on a wrong key or block length. The contract kit checks that
  every declared port is exposed and sane (for `BlockCipher`: sizes, a decrypt∘encrypt round trip
  per key size, wrong lengths throw).
- **Zooming into a block:** a port stays pure crypto. A block cipher whose own lab can show one block
  adds the optional manifest hook `blockLabParams(keyHex, blockHex)` returning that lab's params
  (aes: `{ keyHex, plaintextHex: blockHex, detail: 'op' }`). The mode producers put
  `zoom: { producerId, keyHex, blockHex }` on their cipher chain nodes, and the web host turns it into
  a link via `useLabActions().blockLabHref`; without the hook there is no link.
- **Using a port:** declare a `port` param,
  `{ name: 'cipher', kind: 'port', port: 'BlockCipher', labelKey }`. Its value is a producer id;
  `validate()` only checks that it is a kebab-case string. The panel's options are
  `portOptions(registered, 'BlockCipher')` (every producer that implements the port, labelled by its
  `titleKey`), and `labMessages` loads `portNamespaces(manifest, registered)` so every option is
  translated. The contract kit checks that some registered producer implements the port.
- **Running:** the host calls `preparePorts(manifest, params, registry)` (async; loads only the
  named producers and never throws) and passes the result as `run(params, { resolve })`. `resolve`
  is synchronous. In `run()`, `requirePort(options.resolve, 'BlockCipher', params.cipher)` returns
  the cipher or a `core.error.portMissing` run error. Key sizes come from the resolved cipher:
  `checkKeyLength(cipher, key)` returns a `core.error.keyLength` run error (with `{{sizes}}`), not a
  validate error.
- Oracles and tests run composites with `runWithPorts(manifest, params, producers)` from
  `@cryventure/tools`, which resolves ports against the producers they pass (`primitiveProducers`
  for the real primitive registry; `runOptionsFor` gives just the options).

### `runIn`

`runIn?: 'main' | 'worker'` (optional, additive; default `'main'`). A producer whose run is heavy
(e.g. `padding-oracle`) sets `'worker'`; the web host then runs `preparePorts` and the run in a
module Web Worker and terminates a superseded run. The bundle must be JSON-serializable either way.

### State regions and the views that render them

**`RegionSpec.layout`** (optional, additive) is the producer's presentation hint. It is the only
way to get a word layout; views do not guess one from the shape:

- `{ kind: 'grid' }`: one cell per element, laid out by `shape` and `order`.
- `{ kind: 'words', wordBytes: 4, labelPrefix: 'w', wordsPerGroup: 4 }`: a list of `wordBytes`-byte
  words named `w0`, `w1`, … (`labelPrefix` is a symbol, not translated), grouped `wordsPerGroup` per
  row (for example the four words of one AES round key). `wordBytes` must divide the region's byte
  size (`regionSize × elemBytes(elem)`); the contract kit checks this.

In a `words` region the state view marks the words that contain the step's highlighted elements,
so a producer selects "the current round key" simply by highlighting its bytes. Without a hint (or
with `{ kind: 'grid' }`), `RegionSpec.shape` decides: 2-D shapes up to 8×8 (such as `[4, 4]`)
render as a matrix in their `order`; anything else renders as rows of 16 bytes with an offset
gutter. Regions above 64 elements are collapsible.

### Scope levels

`StateFacet.scopeLevels` labels each scope level, outermost first (AES: round, op).
`labelKey` is the template for the current value (`{{value}}`, `{{ordinal}}`, `{{n}}`). The optional
`nextKey` and `prevKey` (`ScopeLevel.nextKey` / `prevKey`) are full button labels for stepping by
that level, such as "Next round" / „Nächste Runde“ or "Next step" / „Nächster Teilschritt“. Give
whole phrases rather than a noun for a generic template, because German adjectives must agree with
the noun's gender. Without them the player falls back to its generic `ui.player.nextSection` /
`prevSection` ("Next section" / „Nächster Abschnitt“). At the deepest level the scope path shows
the op's `ops[op]` short label instead of the level template when the manifest declares one.

### Derivation facets

Mark the nodes that views should list with `result: true`; intermediates (RotWord, SubWord, …)
leave it unset. Producers that only set `group` still work: `isResultNode(node)` is
`node.result ?? node.group !== undefined`. The optional `DerivationFacet.groups`
(`{ id, label: I18nRef }[]`) names each `group` value, for example "Round key 3"; the key-schedule
view lists results under these labels (generic "Group n" otherwise). The contract kit checks the
label keys and `{{params}}` in EN and DE.

### Conformance vectors (`vectors/conformance.json`)

Every primitive ships at least one known-answer case in one generic format, which the contract
kit discovers and checks on its own (no test code per plugin):

```json
{
  "source": "NIST FIPS 197 (2023), Appendix C.1",
  "cases": [
    {
      "name": "App. C.1 (AES-128)",
      "params": { "keyHex": "000102030405060708090a0b0c0d0e0f", "plaintextHex": "00112233445566778899aabbccddeeff", "detail": "op" },
      "outputs": { "ciphertext": "69c4e0d86a7b0430d8cdb78070b4c55a" }
    }
  ]
}
```

- `source` cites where the expected values come from: a standard, or an independent implementation
  (never the plugin itself).
- `params` is passed to `run()` as is; `outputs` maps `TraceBundle.output` keys to the expected
  bytes as lowercase hex. Only the listed keys are compared.
- Name output keys after what they hold (`ciphertext`, `result`, `sbox`, `bigEndian`), without a
  `Hex` suffix: outputs are byte arrays, not strings.
- Other files in `vectors/` (e.g. intermediate values of FIPS 197 App. B) stay plugin-specific and
  are used by the plugin's own tests.

## Add a view

```sh
pnpm cv new view bit-planes --requires state,values
```

This creates `packages/views/src/bit-planes/` with `manifest.ts` (`defineView`, lazily loaded
component), `BitPlanesView.tsx`, its stylesheet `bitPlanes.css`, a test, and `i18n/{en,de}.json`
under `view.<id>.*`.

- A view reads data through hooks only: `useFacet(kind)`, `useLab(selector)` for the playhead and
  `useT()` for text. Its props are just `{ labId, lens }`.
- Always handle `facet.status` `loading` and `missing`: return
  `<ViewStatus status={facet.status} keys={STATUS_KEYS} />` (from `@cryventure/viz`), where
  `STATUS_KEYS` maps the statuses to the view's own keys (`view.<id>.loading` / `.missing`); viz
  falls back to generic messages for a status without a key.
- Styles live next to the view (`bitPlanes.css`) and are imported by the component
  (`import './bitPlanes.css'`), so Vite ships them in the view's lazy chunk and the built page loads
  them with it. `packages/views/src/css.d.ts` types such imports; Vitest stubs them. Use the
  semantic colour tokens (`--cv-*`, `--sl-color-*`) only, so both themes work.
- Grids are `role="grid"` with roving focus (`ByteGrid`). Highlights pair colour with a glyph,
  border style or weight, so they never rely on colour alone.
- Test with `renderLab()` and `createFixtureBundle()` from `@cryventure/viz/testing`, and load
  messages with `loadViewMessages('en')` from `../messages.ts`.
- `ViewManifest.narrowPlacement` (optional, additive) is `'panel'` (default) or `'caption'`. On
  narrow labs the viz `Workspace` leaves `'caption'` views out of the stacked panels, because the
  player's caption shows the same content there (the narration view does this). Views are ordered
  by `order` (unset last), then id; `viewsFor` applies this order (`compareViews` in core).

### Layout presets

`<Lab layout="state:65|narration:35" />` picks the panels in order. Sizes are optional percentages
and are applied only when every panel has one; they are normalised to 100. Sizes a reader saves win
over the preset. When the lab container is narrower than 720px, panels stack vertically
(minus `'caption'` views, see above).

## Add a deriver

```sh
pnpm cv new deriver demo-trace --from state --provides demo-steps
```

This creates `packages/derivers/src/demo-trace/` with `manifest.ts` (`defineDeriver`, lazily loaded
module), `module.ts` (`derive(bundle)`), `module.test.ts` and `i18n/{en,de}.json` under
`deriver.<id>.*`. The template derives one step per state step and passes the contract kit as
generated; replace its facet with yours. `--from` must include `state` (the template reads it).
`--provides` must name a **new** facet kind: the core kinds (`state`, `values`, `narration`,
`instructions`, `registers`, `memory`, `derivation`, `messages`, `packets`, `filesystem`, `math`,
`field`, `table`, `chain`, `wire`) have core schemas the demo facet would fail, so the CLI rejects
them. To provide one, scaffold with a new kind, then reshape the facet to the core type and change
`provides`. After scaffolding, run `pnpm golden:update` once to record the deriver's first golden
fixture (see below).

A **deriver** computes extra facets from a finished bundle, e.g. the x86 instructions, register
file or memory layout of an AES run (docs/M4.md §1). It depends on `@cryventure/core` only and
never on a producer's code:

- **Contract:** `from` lists the facet kinds it reads, `provides` the kinds it returns (non-empty).
  `appliesTo(bundle)` (optional, default true) decides on the real bundle, e.g.
  `bundle.producer.id === 'aes'` plus a check of the state facet's ops. Read only the producer's
  **published facet contract** (region ids, ops, `values` ids) and throw when it is broken: the
  contract kit runs every deriver over every preset of every primitive, so a renamed region fails CI.
- **`derive(bundle)`** returns every provided kind as `kind@variant` keys, all of them in one call.
  It must be deterministic (no `Math.random`/`Date.now`, enforced by ESLint), JSON-only and must
  not modify the bundle. Shared code goes into `packages/derivers/src/_lib/` (no manifest).
- **Lazy, memoised:** the lab never runs a deriver eagerly. `useFacet(kind)` reports `loading` when
  some deriver provides the kind, its `from` ⊆ the bundle's kinds and `appliesTo` holds; the viz
  runtime then runs `derive` once per bundle and deriver (`deriveOnce`, a `WeakMap` cache) and
  stores the result in one batch. A re-run starts a new cache. A deriver that throws or fails to
  load leaves its facets `missing` and logs once; it is not retried for that bundle.
- **Time (`align`):** derived facets keep their own steps (instructions, register writes, memory
  writes). Each carries `align: { first, last }`, the inclusive range of state steps it covers
  (−1 = the initial state). Step i is current iff `first ≤ p ≤ last`; its effects are visible iff
  `p ≥ last`. Spans never decrease and lie in `[-1, stepCount − 1]` (`alignIssues` in core).
- **Variants:** one deriver may return several variants of a kind (`instructions@x86_64-aesni`,
  `memory@x86_64-c-ref`). Each facet carries its own `label: I18nRef` and metadata; views
  build their pickers from the data, not from the variant string. `useFacet(kind)` without a variant
  returns `default` or else the first one.
- **Namespace:** every key a deriver emits or ships lives under `deriver.<id>.*`. This is a
  convention checked by the contract kit (the manifest has no namespace field).
- **Golden fixtures (required):** `fixtures/<name>.golden.json` holds
  `{ "producerId", "presetId", "facets" }`, the derived facets for one producer preset (`defaults`
  for the defaults), e.g. FIPS 197 C.1. Every deriver needs at least one (docs/M4.md §7); the
  contract fails with "no golden fixture" otherwise and compares the ones it finds. Without any,
  `pnpm golden:update` records the first one, `fixtures/aes-fips197-c1.golden.json` when the deriver
  applies to that preset, else the first applicable preset. To add more, create a file with
  `producerId` and `presetId` only; `pnpm golden:update` regenerates the `facets` of every golden
  file from the current output (review the diff before committing).
- **Kit checks beyond the core schemas:** every array in which any item has an `align` object is a
  span sequence, and its items without one are reported; memory writes must lie in their
  allocation's lifetime (`align.first ≥ allocatedAt`, and `align.last < freedAt` when freed); the
  known `I18nRef` fields of each core kind (`label`, `note`, `covers[]`, `formula`, `impl.label`,
  `terms[].label`, …) must hold `{ key, params? }` refs. Elsewhere only objects of exactly
  `{ key }` or `{ key, params }` count as refs.

### Second ISA family (SHA derivers)

`isa-x86-sha` and `isa-armv8-sha` (docs/M5.md §5) show how a new instruction family reuses the M4
pieces without new facets:

- **Listings:** add a kernel to the table in `packages/tools/src/asm/` (C source per ISA, functions,
  output file, annotator such as `annotateSha.ts` with its own role set) and run `pnpm asm:generate`;
  existing kernels must regenerate byte-identically.
- **Profile:** a per-ISA profile on a shared lib (`derivers/src/_lib/sha`) with a semantics table
  (what each mnemonic reads and writes) drives register values and spans; the deriver files stay
  thin.
- **Values:** every register value is read from the producer's trace (state regions and `wordops`
  terms such as `K_t + W_t`, `p1`, `p2`); the deriver only rearranges bytes (byte swaps, lane
  order, ABEF/CDGH packing) and computes no hash.

## What the contract kit checks

`packages/tools/src/contracts/all.contract.test.ts` runs for every discovered plugin as part of
`pnpm test`.

**Primitives** (`primitiveContract`):
- manifest basics: kebab-case id, `apiVersion` 1, `kind`, `i18nNamespace === plugin.<id>`
- title and preset label keys exist in EN and DE
- param fields name real params, and their label, hint and option keys exist in EN and DE
- declared `ops` label and short-label keys and `outputs` label keys exist in EN and DE
- every catalog key sits under the plugin's namespace
- `defaults` and all presets pass `validate()`
- for `defaults` and every preset: `run()` is deterministic, emits every declared facet, labels
  regions, scope levels (including `nextKey`/`prevKey`) and values with existing keys, declares
  `words` region layouts whose `wordBytes` divide the region, narrates with existing keys whose
  `{{params}}` match the templates (for a plural key: the union over its `_one`/`_other`/… forms),
  replays consistently (keyframes and `stateAt` equal a
  sequential replay), and is JSON-serializable
- with `loadChoreography`: every step's choreography targets existing cells, ends neutral and
  narrates with existing keys; with a `derivation` facet: topological order and `groups` labels
  with existing keys and matching `{{params}}`
- with port params: runs (including conformance cases) get `resolve` from `preparePorts` over the
  `producers` the caller passes (`all.contract.test.ts`: `primitiveProducerSet`, every primitive); `port` fields name a port some producer implements, `text` fields have a
  positive `maxLength` that `defaults` and presets fit, and `runIn` is `main` or `worker`
- with `implements`: every declared port is exposed on the module and passes its sanity check
  (`BlockCipher`: id, sizes, round trip, wrong lengths throw; `Hash`: family id = producer id,
  unique function ids, `blockSize` 64 or 128, and every function is deterministic, leaves its
  input unchanged and returns `outputSize` bytes for inputs of 0, 1 and `blockSize` bytes, those
  three digests pairwise distinct)
- a `Hash` producer with a `digest` output and an `algorithm` select param: for `defaults` and
  every preset whose `algorithm` is a function id of its family, the port's `hash(message)` equals
  `run(params).output.digest` (algorithms outside the family, e.g. an IV-generation mode, are
  skipped). The message is the one the run publishes: the bytes of its `values` facet's `message`
  value, the empty message when a run omits it (empty values are omitted, as SHA-2 does); a `Hash`
  producer none of whose runs publishes a `message` value is not checked
- when a run emits a `wordops` facet: its shape holds (steps and terms are arrays, term ids
  non-empty, `role` a `MathTermRole`, `op` absent or a `WordOp`, `registers` with `before` and
  `after` arrays) and it then passes `validateWordopsFacet` (a validator throw is a reported
  problem), its steps lie within the state steps (−1 only with an `initialNarration`), its term
  `valueRef`s exist in the `values` facet, and its formula and term-label keys and `{{params}}`
  exist in EN and DE
- when a run emits `chain` or `wire` facets: `chainIssues`/`wireIssues` against the state facet's
  step count are empty, and their label keys and `{{params}}` exist in EN and DE
- `vectors/conformance.json` exists, is well-formed, has at least one case, and `run(params)`
  reproduces every listed output (see "Conformance vectors"); `vectorsCheck` adds any
  plugin-specific check on top

**Views** (`viewContract`):
- manifest basics, and at least one required facet
- the title key exists in EN and DE
- catalog keys sit under `view.<id>.*`
- the component loads lazily
- it renders against fixture bundles without throwing and without raw message keys
  (`view.*`, `plugin.*`, `ui.*`, `core.*`) in its text or `aria-label`/`title`/… attributes, in
  EN and DE, in every lens, at the first, middle and last step. The fixtures are generated from the
  real primitives (each run with its defaults, `facetFixtures.ts`): the view gets every bundle that
  carries all its `requires`; if none does, one bundle is assembled per facet kind (`requires` +
  `optional`). A required kind no primitive emits fails the contract until a primitive emits it or
  a `fallbacks` facet is passed to `viewContract`. `all.contract.test.ts` runs in jsdom for this.
  Each fixture bundle also carries the facets of every deriver that applies to it, so views of
  derived kinds (`instructions`, `registers`, `memory`) render against real derived data, with all
  `deriver.*` catalogs loaded.

**Derivers** (`deriverContract`, over `defaults` and every preset of every registered primitive):
- manifest basics, `kind: 'deriver'`, a non-empty `provides`, a `load` function
- applies (`from` ⊆ the bundle's kinds and `appliesTo`) to at least one real preset
- for every preset it applies to: loads and derives without throwing or modifying the bundle,
  deterministically, with JSON-serializable facets
- returns exactly its `provides` kinds (every one, keyed `kind@variant`)
- each facet passes its core validator when its kind has one (`instructions`, `registers`,
  `memory`, `field`, `math`, `table`, `wordops`; for `wordops` the primitive's shape checks run
  first), a validator that throws being a reported problem; memory writes lie in their
  allocation's lifetime
- every array of steps with `align` spans is monotonic and within the bundle's state steps
  (`alignIssues`), and none of its items lacks an `align` span
- every `valueRef` (operands, register writes, memory allocations, refs and writes, field and
  wordops terms, …) exists in the bundle's `values` facet
- the known `I18nRef` fields of each core kind hold well-formed refs; every `I18nRef` (those fields,
  plus exact `{ key }` / `{ key, params }` objects anywhere in the facets) lies under
  `deriver.<id>.*` and exists with matching `{{params}}` in EN and DE; every catalog key sits under
  `deriver.<id>.*`
- at least one `fixtures/*.golden.json` exists, and each matches the derived output for its
  producer and preset

**Assembly listings** (`packages/tools/src/asm/generate.test.ts`, no clang needed): a fake compiler
replays the committed AES and SHA-256 listings as assembly and disassembly with the recorded
compiler version; `buildListings` must rebuild every one, and each must serialize through the
repo's Prettier to the committed `isa-*/data/*.json` byte for byte, so editing the C source, the
parser or the annotators without running `pnpm asm:generate` fails the test.

## i18n rules

- **No hard-coded UI strings.** `i18next/no-literal-string` runs on viz, views and
  `apps/web/src/islands`. Visible symbols such as `w4` or hex bytes are data, not prose.
- Every catalog exists in **EN and native DE** with identical keys and identical `{{params}}`.
  `pnpm i18n:check` checks this for every `i18n/{en,de}.json` under `packages/` and
  `apps/web/src/`, including `packages/core/i18n`. `[DE] ` stubs count as untranslated.
- Namespaces: `core.*` (packages/core/i18n), `ui.*` (viz runtime and app), `view.<id>.*`,
  `plugin.<id>.*`, `deriver.<id>.*`. A key belongs to the package that emits it.

### Message exports (server-side only)

Catalogs are kept out of the package indexes so that lab islands, which import the manifests,
never bundle message JSON. `apps/web/src/components/Lab.astro` assembles exactly one locale on the
server and passes it to the island as a prop:

| Export | Function |
| --- | --- |
| `@cryventure/core/messages` | `loadCoreMessages(lang)` |
| `@cryventure/viz/messages` | `loadVizMessages(lang)` |
| `@cryventure/views/messages` | `loadViewMessages(lang)`: all views, one locale |
| `@cryventure/primitives/messages` | `loadPrimitiveMessages(id, lang)`: one plugin, one locale |
| `@cryventure/derivers/messages` | `loadDeriverMessages(lang)`: all derivers, one locale |

ESLint blocks these imports (and any `i18n/*.json`) inside `apps/web/src/islands`.

## Worked example: a toy XOR "cipher"

1. Run `pnpm cv new primitive toy-xor`. The template already is a working 16-byte XOR primitive,
   with `keyHex` and `inputHex` param fields, two presets, and `state`, `values` and `narration`
   facets.
2. Run `pnpm test`. The contract suite for `toy-xor` passes immediately, and so do your module
   tests.
3. Translate `i18n/de.json` and remove every `[DE] ` prefix, then run `pnpm i18n:check`.
4. Use it on a page:

   ```mdx
   import Lab from '../../../../components/Lab.astro';

   <Lab labId="toy-xor-demo" producerId="toy-xor" presetId="example" layout="state:60|narration:40" />
   ```

   Add the same page under `src/content/docs/de/` (doc parity is checked as well).
5. Run `pnpm dev`, open the page, step through the lab, edit the key, and check EN and DE.
6. Before a PR, run `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test && pnpm e2e`.
   e2e includes axe checks: no serious or critical violations are allowed.
