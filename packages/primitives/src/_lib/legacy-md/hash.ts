import type { HashFamily, HashFunction } from '@cryventure/core';
import { createLegacyContext, MD5_ENGINE, SHA1_ENGINE } from './context.ts';
import { MD5_BLOCK_BYTES, MD5_OUTPUT_BYTES, md5Digest } from './md5.ts';
import { SHA1_BLOCK_BYTES, SHA1_OUTPUT_BYTES, sha1Digest } from './sha1.ts';

/** The untraced `HashFunction`s behind the `md5` and `sha1` producers' `Hash` ports (docs/M6.md §2e). */

export const MD5_FUNCTION: HashFunction = {
  id: 'md5',
  blockSize: MD5_BLOCK_BYTES,
  outputSize: MD5_OUTPUT_BYTES,
  hash: md5Digest,
  create: () => createLegacyContext(MD5_ENGINE),
};

export const SHA1_FUNCTION: HashFunction = {
  id: 'sha-1',
  blockSize: SHA1_BLOCK_BYTES,
  outputSize: SHA1_OUTPUT_BYTES,
  hash: sha1Digest,
  create: () => createLegacyContext(SHA1_ENGINE),
};

/** Family `md5` with the one function `md5`. */
export const MD5_FAMILY: HashFamily = { id: 'md5', functions: [MD5_FUNCTION] };

/** Family `sha1` with the one function `sha-1`. */
export const SHA1_FAMILY: HashFamily = { id: 'sha1', functions: [SHA1_FUNCTION] };
