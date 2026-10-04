import { blockCount, concatBlocks, type MacContext, type MacFunction } from '@cryventure/core';
import { keyedMac } from '../_lib/hmac/macCalls.ts';

/**
 * PBKDF2 (RFC 8018 §5.2) over a `Mac` port function, untraced. Every PRF call clones ONE context
 * keyed with the password (for HMAC: the inner and outer midstates), so the password is never
 * re-keyed: each iteration costs two compressions.
 */

/** INT(i): the block index as four big-endian bytes (RFC 8018 §5.2 step 3). */
export function int32be(index: number): Uint8Array {
  return Uint8Array.of(index >>> 24, (index >>> 16) & 0xff, (index >>> 8) & 0xff, index & 0xff);
}

/** S ‖ INT(i), the message of U₁ in block `index` (1-based). */
export function saltWithIndex(salt: Uint8Array, index: number): Uint8Array {
  return concatBlocks([salt, int32be(index)]);
}

/** Called after iteration `j` (1-based) with U_j and the running F = U₁ ⊕ … ⊕ U_j (both owned by the caller only for the call). */
export type IterationVisitor = (j: number, u: Uint8Array, f: Uint8Array) => void;

/** F(P, S, c, i) = U₁ ⊕ U₂ ⊕ … ⊕ U_c with U₁ = PRF(P, S ‖ INT(i)), U_j = PRF(P, U_{j−1}); each PRF call clones the keyed context (`keyedMac`). */
export function pbkdf2Block(keyed: MacContext, salt: Uint8Array, index: number, iterations: number, visit?: IterationVisitor): Uint8Array {
  let u = keyedMac(keyed, saltWithIndex(salt, index));
  const f = u.slice();
  visit?.(1, u, f);
  for (let j = 2; j <= iterations; j++) {
    u = keyedMac(keyed, u);
    for (let k = 0; k < f.length; k++) f[k] = f[k]! ^ u[k]!;
    visit?.(j, u, f);
  }
  return f;
}

/** DK = T₁ ‖ … ‖ T_l with l = ⌈dkLen / hLen⌉, truncated to `length` bytes (RFC 8018 §5.2 steps 3–5). */
export function pbkdf2(mac: MacFunction, password: Uint8Array, salt: Uint8Array, iterations: number, length: number): Uint8Array {
  const keyed = mac.create(password);
  const dk = new Uint8Array(length);
  for (let index = 1; index <= blockCount(length, mac.outputSize); index++) {
    const offset = (index - 1) * mac.outputSize;
    dk.set(pbkdf2Block(keyed, salt, index, iterations).subarray(0, length - offset), offset);
  }
  return dk;
}
