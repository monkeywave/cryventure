import type { ElemType } from '@cryventure/core';

const HEX_DIGITS: Readonly<Record<ElemType, number>> = { u8: 2, u16: 4, u32: 8, u64: 16, i16: 4 };
const BITS: Readonly<Record<ElemType, number>> = { u8: 8, u16: 16, u32: 32, u64: 64, i16: 16 };

/** Two's-complement aware, zero-padded lowercase hex without prefix, e.g. `3a` for u8 58. */
export function toHex(value: number, elem: ElemType = 'u8'): string {
  const bits = BigInt(BITS[elem]);
  const wrapped = BigInt.asUintN(Number(bits), BigInt(Math.trunc(value)));
  return wrapped.toString(16).padStart(HEX_DIGITS[elem], '0');
}

/** `0x`-prefixed hex, e.g. `0x3a`. */
export function formatHex(value: number, elem: ElemType = 'u8'): string {
  return `0x${toHex(value, elem)}`;
}

/** Offset-gutter label such as `0x0010`. */
export function formatOffset(offset: number, digits = 4): string {
  return `0x${offset.toString(16).padStart(digits, '0')}`;
}
