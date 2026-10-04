import type { HashContext } from '@cryventure/core';
import { MD5_IV, md5Compress, md5PadTail, md5StateBytes } from './md5.ts';
import { SHA1_IV, sha1Compress, sha1PadTail, sha1StateBytes } from './sha1.ts';

/**
 * Incremental MD5 and SHA-1 (docs/M6.md §1): a context compresses every whole 64-byte block as
 * data arrives and keeps only the partial block after it, so a clone after a block is a true
 * midstate (HMAC in TLS 1.0's PRF reuses it). `digest()` pads and compresses a copy of the state.
 */

const BLOCK_BYTES = 64;

/** What a context needs to know about one hash: its compression, final padding and output bytes. */
export interface LegacyEngine {
  readonly iv: readonly number[];
  readonly compress: (state: Uint32Array, block: Uint8Array) => Uint32Array;
  readonly padTail: (tail: Uint8Array, messageBytes: number) => Uint8Array;
  readonly bytes: (state: Uint32Array) => Uint8Array;
}

export const MD5_ENGINE: LegacyEngine = { iv: MD5_IV, compress: md5Compress, padTail: md5PadTail, bytes: md5StateBytes };
export const SHA1_ENGINE: LegacyEngine = { iv: SHA1_IV, compress: sha1Compress, padTail: sha1PadTail, bytes: sha1StateBytes };

/** The running state: the chaining value, the partial block and the message length so far. */
interface LegacyRunning {
  state: Uint32Array;
  partial: Uint8Array;
  partialLength: number;
  messageBytes: number;
}

class LegacyContext implements HashContext {
  constructor(
    private readonly engine: LegacyEngine,
    private readonly running: LegacyRunning,
  ) {}

  update(data: Uint8Array): void {
    const { engine, running } = this;
    running.messageBytes += data.length;
    let offset = this.fillPartial(data);
    if (running.partialLength === BLOCK_BYTES) {
      engine.compress(running.state, running.partial);
      running.partialLength = 0;
    }
    if (running.partialLength > 0) return;
    for (; offset + BLOCK_BYTES <= data.length; offset += BLOCK_BYTES) engine.compress(running.state, data.subarray(offset, offset + BLOCK_BYTES));
    running.partial.set(data.subarray(offset));
    running.partialLength = data.length - offset;
  }

  /** Tops up a non-empty partial block from `data`; returns how many bytes of `data` it took. */
  private fillPartial(data: Uint8Array): number {
    const { running } = this;
    if (running.partialLength === 0) return 0;
    const taken = Math.min(BLOCK_BYTES - running.partialLength, data.length);
    running.partial.set(data.subarray(0, taken), running.partialLength);
    running.partialLength += taken;
    return taken;
  }

  digest(): Uint8Array {
    const { engine, running } = this;
    const state = running.state.slice();
    const tail = engine.padTail(running.partial.subarray(0, running.partialLength), running.messageBytes);
    for (let offset = 0; offset < tail.length; offset += BLOCK_BYTES) engine.compress(state, tail.subarray(offset, offset + BLOCK_BYTES));
    return engine.bytes(state);
  }

  clone(): HashContext {
    const { running } = this;
    return new LegacyContext(this.engine, { ...running, state: running.state.slice(), partial: running.partial.slice() });
  }
}

/** A fresh incremental context for `engine` (its IV, nothing absorbed). */
export function createLegacyContext(engine: LegacyEngine): HashContext {
  return new LegacyContext(engine, { state: Uint32Array.from(engine.iv), partial: new Uint8Array(BLOCK_BYTES), partialLength: 0, messageBytes: 0 });
}
