import { BreakpointPicker, Caption, Controls, ModeToggle, Timeline, useLabLayout } from '@cryventure/viz';

/** Views whose content the caption already shows on narrow labs; the workspace leaves them out there. */
export const VIEWS_SHOWN_IN_CAPTION: readonly string[] = ['narration'];

/**
 * The lab's player chrome. On narrow labs it becomes a sticky mini-player (mode, controls, timeline
 * and the narration caption; styled in lab.css) and the breakpoint chips move below it to keep it short.
 */
export function PlayerBar() {
  const { narrow } = useLabLayout();
  return (
    <>
      <div className="cv-lab__player">
        <ModeToggle />
        <Controls />
        <Timeline />
        <Caption />
        {!narrow && <BreakpointPicker />}
      </div>
      {narrow && <BreakpointPicker />}
    </>
  );
}
