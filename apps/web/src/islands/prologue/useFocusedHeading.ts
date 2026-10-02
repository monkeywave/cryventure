import { useEffect, useRef } from 'react';

/**
 * Moves keyboard and screen-reader focus to a heading whenever `trigger` changes, but only once the
 * learner has interacted, so loading the page never steals focus or scrolls.
 */
export function useFocusedHeading(trigger: unknown, enabled: boolean) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (enabled) ref.current?.focus();
  }, [trigger, enabled]);
  return ref;
}
