import type { Lens } from '@cryventure/core';
import { isLens } from '../../progress/lens.ts';

/** `level`: shown for that lens and deeper ones; `only`: shown for exactly that lens. */
export type LensBlock = { match: 'level' | 'only'; lens: Lens };

/** Validates `<Lens level>` / `<Lens only>` props: exactly one of them, naming a known lens. */
export function lensBlockOf(props: { level?: unknown; only?: unknown }): LensBlock {
  const { level, only } = props;
  if ((level === undefined) === (only === undefined)) throw new Error('<Lens>: pass exactly one of `level` or `only`');
  const match = level === undefined ? 'only' : 'level';
  const lens = level ?? only;
  if (!isLens(lens)) throw new Error(`<Lens ${match}="${String(lens)}">: unknown lens (story | engineer | cryptographer)`);
  return { match, lens };
}
