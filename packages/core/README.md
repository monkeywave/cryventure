# @cryventure/core

The contracts every CryVenture plugin builds on: trace bundles, facets, tracers, registries and i18n refs.

## Model: Producer → Facet → View

```
Producers (primitive | protocol | composite | import)
   └─ emit a TraceBundle of facets keyed `kind@variant` (state, values, narration, …)
Derivers (lazy)
   └─ turn existing facets into new ones (e.g. state → instructions)
Views
   └─ declare the facet kinds they `require`; `viewsFor()` offers every view whose
      requirements are available directly or via one deriver hop
```

- `RecordingTracer` records `state` steps (copy-on-write deltas + keyframes every K steps);
  `stateAt(facet, step)` reconstructs any step. `NullTracer` makes tracing free when off.
- The engine never emits prose: narration and errors are `I18nRef`s rendered by `createTranslator`.
- `Registry` + `definePrimitive` / `defineView` / `defineDeriver` validate manifests (kebab-case id, `apiVersion: 1`).

## Rules

- **No DOM, no React, zero runtime dependencies.** Producers must be able to run in a worker.
- **Deterministic:** no `Date`, no `Math.random`.
- **JSON-serializable facets:** plain arrays and objects only (no `Map`, no typed arrays in facets).
- New facet kinds are additive; plugins never require a core diff.
