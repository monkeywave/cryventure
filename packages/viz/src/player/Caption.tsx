import { useId, useRef, useState } from 'react';
import { useT } from '../i18n/I18nProvider.tsx';
import { useLabLayout } from '../lab/LabLayout.tsx';
import { useCurrentNarration } from '../narration/useCurrentNarration.ts';
import { useIsClamped } from './useIsClamped.ts';

interface CaptionToggleProps {
  expanded: boolean;
  controls: string;
  onToggle: () => void;
}

function CaptionToggle({ expanded, controls, onToggle }: CaptionToggleProps) {
  const t = useT();
  return (
    <button type="button" className="cv-caption__toggle" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
      {t(expanded ? 'ui.caption.collapse' : 'ui.caption.expand')}
    </button>
  );
}

function CaptionBar() {
  const t = useT();
  const textId = useId();
  const text = useCurrentNarration();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const clamped = useIsClamped(textRef, text);
  return (
    <div className="cv-caption" role="group" aria-label={t('ui.caption.label')}>
      <p ref={textRef} id={textId} className="cv-caption__text" data-expanded={expanded} aria-live="polite" aria-atomic="true">
        {text}
      </p>
      {(clamped || expanded) && <CaptionToggle expanded={expanded} controls={textId} onToggle={() => setExpanded(!expanded)} />}
    </div>
  );
}

/**
 * The narration next to the animation on narrow labs: the same text as the narration view (which
 * the workspace hides there, so exactly one live region narrates), clamped to a few lines with an
 * accessible "show full text" toggle. Renders nothing on wide labs.
 */
export function Caption() {
  const { narrow } = useLabLayout();
  return narrow ? <CaptionBar /> : null;
}
