import type { HashContext } from '@cryventure/core';
import { BlockBuffer } from '../hashKit/blockBuffer.ts';
import { isWord32, type AnySha2Algorithm } from './algorithms.ts';
import { sha2PadTail } from './padding.ts';
import { sha512CompressHiLo, toHiLo } from './hilo.ts';
import { sha256Compress } from './reference.ts';

/**
 * Incremental SHA-2, MD5 and SHA-1 (docs/M6.md §1): a context compresses every whole block as data
 * arrives and keeps only the partial block after it, so a clone after a block is a true midstate
 * (what HMAC and PBKDF2 reuse). `digest()` pads and compresses a copy of the state.
 */

type BlockState = Uint32Array | BigUint64Array;

/** What a context needs to know about one hash: block size, compression, final padding and output bytes. */
export interface BlockEngine<S extends BlockState> {
  readonly blockBytes: number;
  readonly compress: (state: S, block: Uint8Array) => S;
  /** The final block(s): the tail after the last whole block, padded with the whole message's length. */
  readonly padTail: (tail: Uint8Array, messageBytes: number) => Uint8Array;
  /** The state as bytes (big-endian for SHA-2, FIPS 180-4 §3.1), in a fresh array that never aliases `state`. */
  readonly bytes: (state: S) => Uint8Array;
}

/** 32-bit words big-endian (FIPS 180-4 §3.1); for a hi/lo state that is its 64-bit words big-endian. */
export function bigEndianWordBytes(state: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(state.length * 4);
  const view = new DataView(bytes.buffer);
  state.forEach((word, index) => view.setUint32(index * 4, word));
  return bytes;
}

const ENGINE32: BlockEngine<Uint32Array> = {
  blockBytes: 64,
  compress: sha256Compress,
  padTail: (tail, messageBytes) => sha2PadTail(tail, messageBytes, 64),
  bytes: bigEndianWordBytes,
};

/** SHA-384/512/512-t on the 32-bit hi/lo compression (docs/M7.md §2a): 16 entries for the 8 words. */
const ENGINE64: BlockEngine<Uint32Array> = {
  blockBytes: 128,
  compress: sha512CompressHiLo,
  padTail: (tail, messageBytes) => sha2PadTail(tail, messageBytes, 128),
  bytes: bigEndianWordBytes,
};

/** Compresses every `blockBytes`-byte block of `padded` into `state` (in place) and returns it. */
export function compressBlocks<S>(state: S, padded: Uint8Array, blockBytes: number, compress: (state: S, block: Uint8Array) => S): S {
  for (let offset = 0; offset < padded.length; offset += blockBytes) compress(state, padded.subarray(offset, offset + blockBytes));
  return state;
}

class BlockContext<S extends BlockState> implements HashContext {
  constructor(
    private readonly engine: BlockEngine<S>,
    private readonly outputSize: number,
    private readonly state: S,
    private readonly buffer: BlockBuffer,
    private messageBytes: number,
  ) {}

  update(data: Uint8Array): void {
    this.messageBytes += data.length;
    this.buffer.feed(data, (block) => this.engine.compress(this.state, block));
  }

  digest(): Uint8Array {
    const { engine } = this;
    const tail = engine.padTail(this.buffer.tail, this.messageBytes);
    return engine.bytes(compressBlocks(this.state.slice() as S, tail, engine.blockBytes, engine.compress)).slice(0, this.outputSize);
  }

  /** H, the chaining value after the last whole block, as `engine.bytes` writes it (docs/M7.md §1a); a fresh copy. */
  chainingState(): Uint8Array {
    return this.engine.bytes(this.state);
  }

  clone(): HashContext {
    return new BlockContext(this.engine, this.outputSize, this.state.slice() as S, this.buffer.clone(), this.messageBytes);
  }
}

/** A fresh incremental context for `engine` from `iv` (nothing absorbed), its digest the first `outputSize` state bytes. */
export function createBlockContext<S extends BlockState>(engine: BlockEngine<S>, iv: S, outputSize: number): HashContext {
  return new BlockContext(engine, outputSize, iv, BlockBuffer.empty(engine.blockBytes), 0);
}

/** A fresh incremental context for `algorithm` (H = its IV, nothing absorbed). */
export function createSha2Context(algorithm: AnySha2Algorithm): HashContext {
  return isWord32(algorithm)
    ? createBlockContext(ENGINE32, Uint32Array.from(algorithm.iv), algorithm.outputSize)
    : createBlockContext(ENGINE64, toHiLo(algorithm.iv), algorithm.outputSize);
}
