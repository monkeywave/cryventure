import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { useT } from '../i18n/I18nProvider.tsx';
import type { LabStore } from './createLabStore.ts';
import { LabProvider } from './LabContext.tsx';
import { usePlayback } from './usePlayback.ts';
import { useLabKeyboard } from './useLabKeyboard.ts';

export interface LabRootProps {
  store: LabStore;
  children: ReactNode;
}

function LabContainer({ children }: { children: ReactNode }) {
  const t = useT();
  const onKeyDown = useLabKeyboard();
  usePlayback();
  return (
    <section className="cv-lab" onKeyDown={onKeyDown} aria-label={t('ui.lab.region')} data-pagefind-ignore>
      {children}
    </section>
  );
}

/**
 * One lab instance: store context, keyboard scope, playback clock and the motion runtime
 * (`domAnimation` only; animations follow the user's reduced-motion preference).
 */
export function LabRoot({ store, children }: LabRootProps) {
  return (
    <LabProvider store={store}>
      <LazyMotion features={domAnimation}>
        <MotionConfig reducedMotion="user">
          <LabContainer>{children}</LabContainer>
        </MotionConfig>
      </LazyMotion>
    </LabProvider>
  );
}
