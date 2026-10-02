import { elemBits, elemBytes, type ElemType } from '@cryventure/core';

/** Two's-complement aware, zero-padded lowercase hex without prefix, e.g. `3a` for u8 58. */
export function toHex(value: number, elem: ElemType = 'u8'): string {
  const wrapped = BigInt.asUintN(elemBits(elem), BigInt(Math.trunc(value)));
  return wrapped.toString(16).padStart(elemBytes(elem) * 2, '0');
}

/** `0x`-prefixed hex, e.g. `0x3a`. */
export function formatHex(value: number, elem: ElemType = 'u8'): string {
  return `0x${toHex(value, elem)}`;
}

/** Offset-gutter label such as `0x0010`. */
export function formatOffset(offset: number, digits = 4): string {
  return `0x${offset.toString(16).padStart(digits, '0')}`;
}
