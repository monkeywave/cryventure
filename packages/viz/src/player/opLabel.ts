import type { Translate } from '@cryventure/core';

/** Producer message key of an op label: `plugin.<producerId>.op.<op>`. */
export function opLabelKey(producerId: string, op: string): string {
  return `plugin.${producerId}.op.${op}`;
}

/** Producer message key of a compact op name for tight spots (scope path): `plugin.<producerId>.opShort.<op>`. */
export function opShortLabelKey(producerId: string, op: string): string {
  return `plugin.${producerId}.opShort.${op}`;
}

function translatedOrUndefined(t: Translate, key: string): string | undefined {
  const label = t(key);
  return label === key ? undefined : label;
}

/** The producer's translated op label, or the raw op name when the producer has no key for it. */
export function opLabel(t: Translate, producerId: string, op: string): string {
  return translatedOrUndefined(t, opLabelKey(producerId, op)) ?? op;
}

/** The compact op name (`opShort`), else the op label, else `undefined` when the producer defines neither. */
export function compactOpLabel(t: Translate, producerId: string, op: string): string | undefined {
  return translatedOrUndefined(t, opShortLabelKey(producerId, op)) ?? translatedOrUndefined(t, opLabelKey(producerId, op));
}
