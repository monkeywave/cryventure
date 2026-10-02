import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { ChoreographyModule } from '@cryventure/core';
import { OpLabelsContext, type OpLabelMap } from '../player/opLabel.ts';
import { ChoreographyProvider } from '../choreography/ChoreographyContext.tsx';
import { useT } from '../i18n/I18nProvider.tsx';
import { useCompactContainer } from '../workspace/useContainerWidth.ts';
import type { LabStore } from './createLabStore.ts';
import type { FrameScheduler } from './frameScheduler.ts';
import { LabProvider } from './LabContext.tsx';
import { LabLayoutProvider } from './LabLayout.tsx';
import { usePlayback } from './usePlayback.ts';
import { useLabKeyboard } from './useLabKeyboard.ts';

export interface LabRootProps {
  store: LabStore;
  /** The producer's optional choreography (`manifest.loadChoreography?.()`); the generic fallback otherwise. */
  choreography?: ChoreographyModule;
  /** The producer's op labels (`manifest.ops`) for breakpoint chips and the scope path; raw op names otherwise. */
  opLabels?: OpLabelMap;
  /** Frame clock for the playhead; injected by tests. */
  scheduler?: FrameScheduler;
  children: ReactNode;
}

function LabContainer({ scheduler, children }: { scheduler?: FrameScheduler; children: ReactNode }) {
  const t = useT();
  const onKeyDown = useLabKeyboard();
  usePlayback({ scheduler });
  const [containerRef, narrow] = useCompactContainer<HTMLElement>();
  return (
    <section ref={containerRef} className="cv-lab" data-narrow={narrow} onKeyDown={onKeyDown} aria-label={t('ui.lab.region')} data-pagefind-ignore>
      <LabLayoutProvider narrow={narrow}>{children}</LabLayoutProvider>
    </section>
  );
}

/**
 * One lab instance: store context, choreography, keyboard scope, playback clock, the lab's layout
 * (`useLabLayout`, measured on the lab container) and the motion runtime (`domAnimation` only; animations follow the user's reduced-motion preference).
 */
export function LabRoot({ store, choreography, opLabels, scheduler, children }: LabRootProps) {
  return (
    <LabProvider store={store}>
      <ChoreographyProvider module={choreography}>
        <OpLabelsContext.Provider value={opLabels}>
          <LazyMotion features={domAnimation}>
            <MotionConfig reducedMotion="user">
              <LabContainer scheduler={scheduler}>{children}</LabContainer>
            </MotionConfig>
          </LazyMotion>
        </OpLabelsContext.Provider>
      </ChoreographyProvider>
    </LabProvider>
  );
}
