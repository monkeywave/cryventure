# choreography

Continuous-playhead animation from `docs/PLAN.md` §2b "Time model, choreography, scene graph".

- The lab store owns `progress: MotionValue<number>` (0..1 inside the current step, `t = step + progress`).
  Jumps (`seek`, `prev`, rounds) set it to 1 (end state); animated steps start at 0 and the
  playback driver (`lab/playbackDriver.ts`) tweens it linearly to 1 over the step's duration.
- `resolveChoreography.ts` asks the producer's optional `ChoreographyModule` for a
  `StepChoreography` per step (memoised) and falls back to core `fallbackChoreography`.
- `nodeTracks.ts` maps tracks to region cells. Each `ByteGrid` precomputes its animated nodes once
  per step (`cells/gridMotion.ts`) and runs them from ONE progress listener: it writes only the
  CSS custom properties a node animates (`--cv-dx`, `--cv-dy`, `--cv-scale`, `--cv-opacity`,
  `--cv-emphasis`) and only when their value changed, and re-renders only when a value switch flips.
- Reduced motion: no tweening; progress jumps to 1 and values only cross-fade.
