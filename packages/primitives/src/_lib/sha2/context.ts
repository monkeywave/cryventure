import type { HashContext } from '@cryventure/core';
import { isWord32, type AnySha2Algorithm } from './algorithms.ts';
import { sha2PadTail, type Sha2BlockBytes } from './padding.ts';
import { sha256Compress, sha512Compress } from './reference.ts';

/**
 * Incremental SHA-2 (docs/M6.md §1): a context compresses every whole block as data arrives and
 * keeps only the partial block after it, so a clone after a block is a true midstate (what HMAC
 * and PBKDF2 reuse). `digest()` pads and compresses a copy of the state.
 */

type Sha2State = Uint32Array | BigUint64Array;

/** What a context needs to know about one word size. */
interface Sha2Engine<S extends Sha2State> {
  readonly blockBytes: Sha2BlockBytes;
  readonly copy: (state: S) => S;
  readonly compress: (state: S, block: Uint8Array) => S;
  /** H as bytes, big-endian (FIPS 180-4 §3.1). */
  readonly bytes: (state: S) => Uint8Array;
}

const ENGINE32: Sha2Engine<Uint32Array> = {
  blockBytes: 64,
  copy: (state) => state.slice(),
  compress: sha256Compress,
  bytes(state) {
    const bytes = new Uint8Array(state.length * 4);
    const view = new DataView(bytes.buffer);
    state.forEach((word, index) => view.setUint32(index * 4, word));
    return bytes;
  },
};

const ENGINE64: Sha2Engine<BigUint64Array> = {
  blockBytes: 128,
  copy: (state) => state.slice(),
  compress: sha512Compress,
  bytes(state) {
    const bytes = new Uint8Array(state.length * 8);
    const view = new DataView(bytes.buffer);
    state.forEach((word, index) => view.setBigUint64(index * 8, word));
    return bytes;
  },
};

/** The running state: H, the partial block and the message length so far. */
interface Sha2Running<S extends Sha2State> {
  state: S;
  partial: Uint8Array;
  partialLength: number;
  messageBytes: number;
}

class Sha2Context<S extends Sha2State> implements HashContext {
  constructor(
    private readonly engine: Sha2Engine<S>,
    private readonly outputSize: number,
    private readonly running: Sha2Running<S>,
  ) {}

  update(data: Uint8Array): void {
    const { engine, running } = this;
    const size = engine.blockBytes;
    running.messageBytes += data.length;
    let offset = this.fillPartial(data);
    if (running.partialLength === size) {
      engine.compress(running.state, running.partial);
      running.partialLength = 0;
    }
    if (running.partialLength > 0) return;
    for (; offset + size <= data.length; offset += size) engine.compress(running.state, data.subarray(offset, offset + size));
    running.partial.set(data.subarray(offset));
    running.partialLength = data.length - offset;
  }

  /** Tops up a non-empty partial block from `data`; returns how many bytes of `data` it took. */
  private fillPartial(data: Uint8Array): number {
    const { running } = this;
    if (running.partialLength === 0) return 0;
    const taken = Math.min(this.engine.blockBytes - running.partialLength, data.length);
    running.partial.set(data.subarray(0, taken), running.partialLength);
    running.partialLength += taken;
    return taken;
  }

  digest(): Uint8Array {
    const { engine, running } = this;
    const state = engine.copy(running.state);
    const tail = sha2PadTail(running.partial.subarray(0, running.partialLength), running.messageBytes, engine.blockBytes);
    for (let offset = 0; offset < tail.length; offset += engine.blockBytes) engine.compress(state, tail.subarray(offset, offset + engine.blockBytes));
    return engine.bytes(state).slice(0, this.outputSize);
  }

  clone(): HashContext {
    const { engine, running } = this;
    return new Sha2Context(engine, this.outputSize, { ...running, state: engine.copy(running.state), partial: running.partial.slice() });
  }
}

function newContext<S extends Sha2State>(engine: Sha2Engine<S>, iv: S, outputSize: number): HashContext {
  return new Sha2Context(engine, outputSize, { state: iv, partial: new Uint8Array(engine.blockBytes), partialLength: 0, messageBytes: 0 });
}

/** A fresh incremental context for `algorithm` (H = its IV, nothing absorbed). */
export function createSha2Context(algorithm: AnySha2Algorithm): HashContext {
  return isWord32(algorithm)
    ? newContext(ENGINE32, Uint32Array.from(algorithm.iv), algorithm.outputSize)
    : newContext(ENGINE64, BigUint64Array.from(algorithm.iv), algorithm.outputSize);
}
