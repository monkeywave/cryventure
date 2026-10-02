# choreography

Continuous-playhead animation from `docs/PLAN.md` §2b "Time model, choreography, scene graph".

- The lab store owns `progress: MotionValue<number>` (0..1 inside the current step, `t = step + progress`).
  Jumps (`seek`, `prev`, rounds) set it to 1 (end state); animated steps start at 0 and the
  playback driver (`lab/playbackDriver.ts`) tweens it linearly to 1 over the step's duration.
- `resolveChoreography.ts` asks the producer's optional `ChoreographyModule` for a
  `StepChoreography` per step (memoised) and falls back to core `fallbackChoreography`.
- `nodeTracks.ts` maps tracks to region cells; `ByteCell` samples them on every progress change
  and writes CSS custom properties (`--cv-dx`, `--cv-dy`, `--cv-scale`, `--cv-opacity`,
  `--cv-emphasis`) without React re-renders.
- Reduced motion: no tweening; progress jumps to 1 and values only cross-fade.
