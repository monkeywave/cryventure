# Extending CryVenture

How to add a **primitive** (an algorithm that produces a trace) or a **view** (a React panel that
renders facets of a trace). Background and the reasoning behind these rules: `docs/PLAN.md` §2b
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

There is no list to edit: `packages/primitives/src/index.ts` discovers `*/manifest.ts` with
`import.meta.glob`, and the contract kit (below) picks the new plugin up automatically.

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

### State regions and the views that render them

`RegionSpec.shape` controls the layout in the state view. `[4, 4]` renders as a matrix. `[n, 4]`
with `n > 4` renders as **words**: one row per 4-byte word with a `w<i>` header, laid out 1, 2 or 4
words per line depending on the panel width. When a step highlights the region, its words are
marked. If the step's op carries a numeric `roundKeyIndex`, words `4·i … 4·i+3` are marked;
otherwise the words containing highlighted bytes are. Any other shape renders as rows of 16 bytes
with an offset gutter.

## Add a view

```sh
pnpm cv new view bit-planes --requires state,values
```

This creates `packages/views/src/bit-planes/` with `manifest.ts` (`defineView`, lazily loaded
component), `BitPlanesView.tsx`, a test, and `i18n/{en,de}.json` under `view.<id>.*`.

- A view reads data through hooks only: `useFacet(kind)`, `useLab(selector)` for the playhead and
  `useT()` for text. Its props are just `{ labId, lens }`.
- Always handle `facet.status` `loading` and `missing` with a translated `role="status"` message.
- Grids are `role="grid"` with roving focus (`ByteGrid`). Highlights pair colour with a glyph,
  border style or weight, so they never rely on colour alone.
- Test with `renderLab()` and `createFixtureBundle()` from `@cryventure/viz/testing`, and load
  messages with `loadViewMessages('en')` from `../messages.ts`.

### Layout presets

`<Lab layout="state:65|narration:35" />` picks the panels in order. Sizes are optional percentages
and are applied only when every panel has one; they are normalised to 100. Sizes a reader saves win
over the preset. When the workspace container is narrower than 720px, panels stack vertically.

## What the contract kit checks

`packages/tools/src/contracts/all.contract.test.ts` runs for every discovered plugin as part of
`pnpm test`.

**Primitives** (`primitiveContract`):
- manifest basics: kebab-case id, `apiVersion` 1, `kind`, `i18nNamespace === plugin.<id>`
- title and preset label keys exist in EN and DE
- param fields name real params, and their label, hint and option keys exist in EN and DE
- every catalog key sits under the plugin's namespace
- `defaults` and all presets pass `validate()`
- for `defaults` and every preset: `run()` is deterministic, emits every declared facet, labels
  regions and values with existing keys, narrates with existing keys whose `{{params}}` match the
  templates, replays consistently (keyframes and `stateAt` equal a sequential replay), and is
  JSON-serializable
- optionally, conformance to the plugin's `vectors/` (pass `vectorsCheck`)

**Views** (`viewContract`):
- manifest basics, and at least one required facet
- the title key exists in EN and DE
- catalog keys sit under `view.<id>.*`
- the component loads lazily

## i18n rules

- **No hard-coded UI strings.** `i18next/no-literal-string` runs on viz, views and
  `apps/web/src/islands`. Visible symbols such as `w4` or hex bytes are data, not prose.
- Every catalog exists in **EN and native DE** with identical keys and identical `{{params}}`.
  `pnpm i18n:check` checks this for every `i18n/{en,de}.json` under `packages/` and
  `apps/web/src/`, including `packages/core/i18n`. `[DE] ` stubs count as untranslated.
- Namespaces: `core.*` (packages/core/i18n), `ui.*` (viz runtime and app), `view.<id>.*`,
  `plugin.<id>.*`. A key belongs to the package that emits it.

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
