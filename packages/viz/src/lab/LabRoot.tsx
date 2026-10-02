import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { ChoreographyModule } from '@cryventure/core';
import { ChoreographyProvider } from '../choreography/ChoreographyContext.tsx';
import { useT } from '../i18n/I18nProvider.tsx';
import type { LabStore } from './createLabStore.ts';
import type { FrameScheduler } from './frameScheduler.ts';
import { LabProvider } from './LabContext.tsx';
import { usePlayback } from './usePlayback.ts';
import { useLabKeyboard } from './useLabKeyboard.ts';

export interface LabRootProps {
  store: LabStore;
  /** The producer's optional choreography (`manifest.loadChoreography?.()`); the generic fallback otherwise. */
  choreography?: ChoreographyModule;
  /** Frame clock for the playhead; injected by tests. */
  scheduler?: FrameScheduler;
  children: ReactNode;
}

function LabContainer({ scheduler, children }: { scheduler?: FrameScheduler; children: ReactNode }) {
  const t = useT();
  const onKeyDown = useLabKeyboard();
  usePlayback({ scheduler });
  return (
    <section className="cv-lab" onKeyDown={onKeyDown} aria-label={t('ui.lab.region')} data-pagefind-ignore>
      {children}
    </section>
  );
}

/**
 * One lab instance: store context, choreography, keyboard scope, playback clock and the motion
 * runtime (`domAnimation` only; animations follow the user's reduced-motion preference).
 */
export function LabRoot({ store, choreography, scheduler, children }: LabRootProps) {
  return (
    <LabProvider store={store}>
      <ChoreographyProvider module={choreography}>
        <LazyMotion features={domAnimation}>
          <MotionConfig reducedMotion="user">
            <LabContainer scheduler={scheduler}>{children}</LabContainer>
          </MotionConfig>
        </LazyMotion>
      </ChoreographyProvider>
    </LabProvider>
  );
}
