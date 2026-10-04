import type { HashContext } from '@cryventure/core';
import type { Blake2Flavour } from './manifestKit.ts';
import { BLAKE2B_ENGINE, BLAKE2S_ENGINE, checkBlake2Sizes, type Blake2Engine, type Blake2State } from './reference.ts';

/**
 * Incremental BLAKE2 (docs/M6.md §1, RFC 7693 §3.3). BLAKE2 flags the *last* block, so a context
 * compresses a full buffered block only once more data arrives; it keeps at most one block, and a
 * clone after a block is a true midstate. `digest()` finalises a copy.
 */

/** The running state: h, the buffered (possibly full) block and the bytes compressed so far. */
interface Blake2Running<S extends Blake2State> {
  state: S;
  buffer: Uint8Array;
  buffered: number;
  /** t: bytes already compressed (the key block counts). */
  compressed: number;
}

class Blake2Context<S extends Blake2State> implements HashContext {
  constructor(
    private readonly engine: Blake2Engine<S>,
    private readonly outputBytes: number,
    private readonly running: Blake2Running<S>,
  ) {}

  update(data: Uint8Array): void {
    let offset = 0;
    while (offset < data.length) {
      this.flushFullBuffer();
      offset = this.compressWholeBlocks(data, offset);
      offset += this.fillBuffer(data, offset);
    }
  }

  /** More data follows, so a full buffer is not the last block: compress it. */
  private flushFullBuffer(): void {
    const { engine, running } = this;
    if (running.buffered < engine.blockBytes) return;
    running.compressed += engine.blockBytes;
    engine.compress(running.state, running.buffer, running.compressed, false);
    running.buffered = 0;
  }

  /** With an empty buffer, compresses every block of `data` that is followed by more data; returns the new offset. */
  private compressWholeBlocks(data: Uint8Array, offset: number): number {
    const { engine, running } = this;
    const size = engine.blockBytes;
    if (running.buffered > 0) return offset;
    for (; data.length - offset > size; offset += size) {
      running.compressed += size;
      engine.compress(running.state, data.subarray(offset, offset + size), running.compressed, false);
    }
    return offset;
  }

  /** Copies as much of `data[offset…]` into the buffer as fits; returns how many bytes it took. */
  private fillBuffer(data: Uint8Array, offset: number): number {
    const { engine, running } = this;
    const taken = Math.min(engine.blockBytes - running.buffered, data.length - offset);
    running.buffer.set(data.subarray(offset, offset + taken), running.buffered);
    running.buffered += taken;
    return taken;
  }

  digest(): Uint8Array {
    const { engine, running } = this;
    const state = engine.copy(running.state);
    const last = new Uint8Array(engine.blockBytes);
    last.set(running.buffer.subarray(0, running.buffered));
    engine.compress(state, last, running.compressed + running.buffered, true);
    return engine.bytes(state).slice(0, this.outputBytes);
  }

  /**
   * h after the blocks compressed so far, little-endian (docs/M7.md §1a); a buffered block is not in it yet.
   * BLAKE2 keeps the last full block buffered until it knows whether it is final (the final flag), so
   * after a key block alone this is still h0: why the hmac lab shows no midstate for BLAKE2.
   */
  chainingState(): Uint8Array {
    return this.engine.bytes(this.running.state);
  }

  clone(): HashContext {
    const { engine, running } = this;
    return new Blake2Context(engine, this.outputBytes, { ...running, state: engine.copy(running.state), buffer: running.buffer.slice() });
  }
}

function newContext<S extends Blake2State>(engine: Blake2Engine<S>, outputBytes: number, key: Uint8Array): HashContext {
  checkBlake2Sizes(engine, outputBytes, key.length);
  const buffer = new Uint8Array(engine.blockBytes);
  buffer.set(key);
  // A key is block 0 (zero-padded), buffered like data: it is the last block when no data follows.
  const buffered = key.length > 0 ? engine.blockBytes : 0;
  return new Blake2Context(engine, outputBytes, { state: engine.initialState(outputBytes, key.length), buffer, buffered, compressed: 0 });
}

/** A fresh context for BLAKE2s/b with `outputBytes` digest bytes and an optional key; throws a RangeError on bad sizes. */
export function createBlake2Context(flavour: Blake2Flavour, outputBytes: number, key: Uint8Array = new Uint8Array()): HashContext {
  return flavour === 'blake2s' ? newContext(BLAKE2S_ENGINE, outputBytes, key) : newContext(BLAKE2B_ENGINE, outputBytes, key);
}
