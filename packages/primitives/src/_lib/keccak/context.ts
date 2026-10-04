import type { HashContext, XofContext } from '@cryventure/core';
import { BlockBuffer } from '../hashKit/blockBuffer.ts';
import { absorbHiLo, hiLoStateBytes, keccakF1600HiLo, zeroHiLoState, type KeccakHiLoState } from './hilo.ts';
import { padTail, type DomainSuffix } from './padding.ts';
import { squeezeFromHiLo } from './portSponge.ts';

/**
 * Incremental sponges (docs/M6.md §1): the absorbing state permutes every whole rate block as data
 * arrives and keeps only the partial block, so a clone after a block is a true midstate. A hash
 * context's `digest()` pads and squeezes a copy; an XOF context switches to squeezing on its first
 * `squeeze` and refuses further input. The lanes are the hi/lo `Uint32Array` of `hilo.ts` (docs/M7.md
 * §2a); the bytes are those of the `bigint` sponge.
 */

/** The absorbing phase: the lanes plus the partial rate block. */
class AbsorbingSponge {
  constructor(
    private readonly rateBytes: number,
    private readonly suffix: DomainSuffix,
    private readonly state: KeccakHiLoState,
    private readonly buffer: BlockBuffer,
  ) {}

  static fresh(rateBytes: number, suffix: DomainSuffix): AbsorbingSponge {
    return new AbsorbingSponge(rateBytes, suffix, zeroHiLoState(), BlockBuffer.empty(rateBytes));
  }

  absorb(data: Uint8Array): void {
    this.buffer.feed(data, (block) => {
      keccakF1600HiLo(absorbHiLo(this.state, block));
    });
  }

  /** The state after the padded last block (this sponge stays unchanged). */
  finish(): KeccakHiLoState {
    const { tail } = this.buffer;
    const last = new Uint8Array(this.rateBytes);
    last.set(tail);
    last.set(padTail(tail.length, this.rateBytes, this.suffix), tail.length);
    return keccakF1600HiLo(absorbHiLo(this.state.slice(), last));
  }

  /** The 200-byte state after the last whole rate block, in FIPS 202 byte order (no buffered bytes). */
  stateBytes(): Uint8Array {
    return hiLoStateBytes(this.state);
  }

  clone(): AbsorbingSponge {
    return new AbsorbingSponge(this.rateBytes, this.suffix, this.state.slice(), this.buffer.clone());
  }
}

class KeccakHashContext implements HashContext {
  constructor(
    private readonly sponge: AbsorbingSponge,
    private readonly rateBytes: number,
    private readonly outputSize: number,
  ) {}

  update(data: Uint8Array): void {
    this.sponge.absorb(data);
  }

  digest(): Uint8Array {
    return squeezeFromHiLo(this.sponge.finish(), this.rateBytes, this.outputSize);
  }

  /** The sponge state as bytes (docs/M7.md §1a). */
  chainingState(): Uint8Array {
    return this.sponge.stateBytes();
  }

  clone(): HashContext {
    return new KeccakHashContext(this.sponge.clone(), this.rateBytes, this.outputSize);
  }
}

/** The squeezing phase: the state and the unread rest of its current rate block. */
interface Squeezing {
  state: KeccakHiLoState;
  block: Uint8Array;
  offset: number;
}

class KeccakXofContext implements XofContext {
  constructor(
    private readonly sponge: AbsorbingSponge,
    private readonly rateBytes: number,
    private squeezing?: Squeezing,
  ) {}

  update(data: Uint8Array): void {
    if (this.squeezing !== undefined) throw new Error('XofContext.update: the context is already squeezing');
    this.sponge.absorb(data);
  }

  squeeze(length: number): Uint8Array {
    if (!Number.isInteger(length) || length < 0) throw new RangeError(`XofContext.squeeze: length ${length} is not a non-negative integer`);
    const squeezing = (this.squeezing ??= this.startSqueezing());
    const out = new Uint8Array(length);
    for (let written = 0; written < length; ) {
      if (squeezing.offset === this.rateBytes) this.nextBlock(squeezing);
      const taken = Math.min(length - written, this.rateBytes - squeezing.offset);
      out.set(squeezing.block.subarray(squeezing.offset, squeezing.offset + taken), written);
      squeezing.offset += taken;
      written += taken;
    }
    return out;
  }

  clone(): XofContext {
    const squeezing = this.squeezing === undefined ? undefined : { ...this.squeezing, state: this.squeezing.state.slice() };
    return new KeccakXofContext(this.sponge.clone(), this.rateBytes, squeezing);
  }

  private startSqueezing(): Squeezing {
    const state = this.sponge.finish();
    return { state, block: hiLoStateBytes(state, this.rateBytes), offset: 0 };
  }

  private nextBlock(squeezing: Squeezing): void {
    keccakF1600HiLo(squeezing.state);
    squeezing.block = hiLoStateBytes(squeezing.state, this.rateBytes);
    squeezing.offset = 0;
  }
}

/** A fresh hash context (nothing absorbed) for a fixed-length function with this rate, suffix and digest size. */
export function createKeccakHashContext(rateBytes: number, suffix: DomainSuffix, outputSize: number): HashContext {
  return new KeccakHashContext(AbsorbingSponge.fresh(rateBytes, suffix), rateBytes, outputSize);
}

/** A fresh XOF context that has absorbed `prefix` (cSHAKE's bytepad(encode_string(N) ‖ encode_string(S), r); empty otherwise). */
export function createKeccakXofContext(rateBytes: number, suffix: DomainSuffix, prefix: Uint8Array): XofContext {
  const sponge = AbsorbingSponge.fresh(rateBytes, suffix);
  sponge.absorb(prefix);
  return new KeccakXofContext(sponge, rateBytes);
}
