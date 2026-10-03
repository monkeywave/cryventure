import { useId, useState } from 'react';
import type { Messages } from '@cryventure/core';
import { I18nProvider, useT, useWidthObserver } from '@cryventure/viz';
import { useHydrated } from '../shared/useHydrated.ts';
import { usePrefersReducedMotion } from '../shared/usePrefersReducedMotion.ts';
import { FlyDiagram } from './FlyDiagram.tsx';
import { geometryFor } from './flyGeometry.ts';
import { FLY_BEATS, FLY_IMPLS, FLY_TARGETS, captionKey } from './flyThroughModel.ts';
import { useFlyThrough, type FlyThroughApi } from './useFlyThrough.ts';

export interface FlyThroughProps {
  /** `ui.flyThrough.*` of the page locale (assembled by `FlyThrough.astro`). */
  messages: Messages;
  locale?: string;
  /** Preselected implementation; default `c-ref`. */
  initialImpl?: (typeof FLY_IMPLS)[number];
  /** Preselected destination; default `rd_key`. */
  initialTarget?: (typeof FLY_TARGETS)[number];
}

interface ChoiceProps<Value extends string> {
  name: string;
  legendKey: string;
  optionKey: (value: Value) => string;
  values: readonly Value[];
  value: Value;
  disabled: boolean;
  onChange: (value: Value) => void;
}

function Choice<Value extends string>({ name, legendKey, optionKey, values, value, disabled, onChange }: ChoiceProps<Value>) {
  const t = useT();
  return (
    <fieldset className="cv-fly__choice">
      <legend>{t(legendKey)}</legend>
      {values.map((option) => (
        <label key={option}>
          <input type="radio" name={name} value={option} checked={value === option} disabled={disabled} onChange={() => onChange(option)} />
          {t(optionKey(option))}
        </label>
      ))}
    </fieldset>
  );
}

function PlayerButtons({ fly, disabled }: { fly: FlyThroughApi; disabled: boolean }) {
  const t = useT();
  return (
    <div className="cv-fly__buttons">
      <button type="button" className="cv-fly__button" onClick={() => fly.step(-1)} disabled={disabled || fly.isFirst}>
        {t('ui.flyThrough.back')}
      </button>
      <button type="button" className="cv-fly__button cv-fly__button--primary" onClick={fly.togglePlay} disabled={disabled}>
        {t(fly.playing ? 'ui.flyThrough.pause' : 'ui.flyThrough.play')}
      </button>
      <button type="button" className="cv-fly__button" onClick={() => fly.step(1)} disabled={disabled || fly.isLast}>
        {t('ui.flyThrough.step')}
      </button>
    </div>
  );
}

function FlyThroughBody({ initialImpl = 'c-ref', initialTarget = 'rd_key' }: Omit<FlyThroughProps, 'messages' | 'locale'>) {
  const t = useT();
  const hydrated = useHydrated();
  // Not motion's `useReducedMotion`: it reads the media query once into useState, so a hydrated island
  // keeps the server's `false` (React does not patch attribute mismatches). This hook re-renders.
  const reducedMotion = usePrefersReducedMotion();
  const titleId = useId();
  const captionId = useId();
  const fly = useFlyThrough({ impl: initialImpl, target: initialTarget });
  const [width, setWidth] = useState<number | undefined>(undefined);
  const measure = useWidthObserver<HTMLElement>(setWidth);
  const geometry = geometryFor(width);
  const { view } = fly;
  const beat = FLY_BEATS[view.beat]!;
  return (
    <section ref={measure} className="cv-fly" aria-labelledby={titleId} data-hydrated={hydrated} data-beat={beat} data-impl={view.impl} data-target={view.target} data-motion={reducedMotion ? 'reduce' : 'full'}>
      <p id={titleId} className="cv-fly__title">
        {t('ui.flyThrough.title')}
      </p>
      <div className="cv-fly__controls">
        <Choice name={`${titleId}-impl`} legendKey="ui.flyThrough.impl.legend" optionKey={(impl) => `ui.flyThrough.impl.${impl}`} values={FLY_IMPLS} value={view.impl} disabled={!hydrated} onChange={fly.setImpl} />
        <Choice name={`${titleId}-target`} legendKey="ui.flyThrough.target.legend" optionKey={(target) => `ui.flyThrough.target.${target}`} values={FLY_TARGETS} value={view.target} disabled={!hydrated} onChange={fly.setTarget} />
      </div>
      <div className="cv-fly__scroll">
        <FlyDiagram geometry={geometry} view={view} previous={fly.previous} reducedMotion={reducedMotion} describedBy={captionId} />
      </div>
      <PlayerButtons fly={fly} disabled={!hydrated} />
      <p className="cv-fly__beat">{t('ui.flyThrough.beatCount', { beat: view.beat + 1, total: FLY_BEATS.length })}</p>
      {/* Announce a beat when the reader steps or pauses, not every beat of the playback. */}
      <p id={captionId} className="cv-fly__caption" aria-live={fly.playing ? 'off' : 'polite'}>
        {t(captionKey(beat, view.impl, view.target))}
      </p>
    </section>
  );
}

/** AES bytes from the state matrix into `xmm0` and RAM (docs/M4.md §8): stepped by the reader, never autoplayed. */
export default function FlyThrough({ messages, locale, ...props }: FlyThroughProps) {
  return (
    <I18nProvider messages={messages} locale={locale}>
      <FlyThroughBody {...props} />
    </I18nProvider>
  );
}
