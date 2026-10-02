# choreography (M1 — not implemented yet)

Reserved for the continuous-playhead animation system from `docs/PLAN.md` §2b "Time model,
choreography, scene graph": a `MotionValue` playhead (`t = step + progress`), pure
`Choreography(prevState, event, layout) → Track[]` functions exported by producers, and a scene
graph with stable node ids (`valueRef:byteIndex`) for cross-view transitions.

Until then `ByteCell` uses the generic fallback from the plan: a short flash/scale on value
change, disabled under `prefers-reduced-motion`.
