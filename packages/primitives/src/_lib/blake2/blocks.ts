/**
 * How BLAKE2 cuts its input into blocks (RFC 7693 §3.3): a non-empty key becomes block 0, zero-padded
 * to a full block; the message follows, its last block zero-padded; the empty unkeyed message is one
 * all-zero block. Each block carries its counter t (bytes so far, the key block counting as a full
 * block) and whether it is the last.
 */
export interface Blake2BlockPlan {
  /** The block's bytes (always `blockBytes` long). */
  bytes: number[];
  /** Where the block comes from: the key, message bytes, or nothing (the empty unkeyed message). */
  source: 'key' | 'message' | 'empty';
  /** The message bytes the block holds: `messageOffset … messageOffset + messageLength − 1`. */
  messageOffset: number;
  messageLength: number;
  t: number;
  last: boolean;
}

function zeroPadded(bytes: readonly number[], size: number): number[] {
  return [...bytes, ...new Array<number>(size - bytes.length).fill(0)];
}

/** The blocks of `message` under `key` (empty = unkeyed). */
export function blake2Blocks(message: readonly number[], key: readonly number[], blockBytes: number): Blake2BlockPlan[] {
  const keyed = key.length > 0;
  const messageBlocks = Math.ceil(message.length / blockBytes);
  const total = Math.max(1, messageBlocks + (keyed ? 1 : 0));
  const inputBytes = (keyed ? blockBytes : 0) + message.length;
  return Array.from({ length: total }, (_, index): Blake2BlockPlan => {
    const last = index === total - 1;
    const t = last ? inputBytes : (index + 1) * blockBytes;
    if (keyed && index === 0) return { bytes: zeroPadded(key, blockBytes), source: 'key', messageOffset: 0, messageLength: 0, t, last };
    const messageIndex = index - (keyed ? 1 : 0);
    const messageOffset = messageIndex * blockBytes;
    const slice = message.slice(messageOffset, messageOffset + blockBytes);
    return { bytes: zeroPadded(slice, blockBytes), source: message.length === 0 ? 'empty' : 'message', messageOffset, messageLength: slice.length, t, last };
  });
}
