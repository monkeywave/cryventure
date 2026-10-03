import { ghash as nobleGhash } from '@noble/ciphers/_polyval.js';
import { ghash, toHex, type PrimitiveManifest } from '@cryventure/core';
import { primitiveManifests } from '@cryventure/primitives';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { primitiveProducers, runWithPorts } from '../contracts/runWithPorts.ts';

/**
 * Oracle: the traced `ghash` producer (both details) and core's untraced `ghash` must agree with
 * @noble/ciphers' GHASH for random hash subkeys H and 1–4 blocks.
 */
const BLOCK_BYTES = 16;
const MAX_BLOCKS = 4;
const RUNS = 100;

const hArb = fc.uint8Array({ minLength: BLOCK_BYTES, maxLength: BLOCK_BYTES });
const inputArb = fc.integer({ min: 1, max: MAX_BLOCKS }).chain((blocks) => fc.uint8Array({ minLength: blocks * BLOCK_BYTES, maxLength: blocks * BLOCK_BYTES }));
const detailArb = fc.constantFrom('block', 'bit');

function ghashManifest(): PrimitiveManifest {
  const found = primitiveManifests.find((candidate) => candidate.id === 'ghash');
  if (found === undefined) throw new Error('ghash manifest not registered');
  return found;
}

async function runGhash(h: Uint8Array, input: Uint8Array, detail: string): Promise<string> {
  const result = await runWithPorts(ghashManifest(), { hHex: toHex(h), inputHex: toHex(input), detail }, primitiveProducers);
  if (!result.ok) throw new Error(`ghash rejected params: ${result.error.key}`);
  return toHex(result.trace.output['ghash']!);
}

describe('ghash oracle (@noble/ciphers)', () => {
  it('core ghash equals noble ghash', () => {
    fc.assert(
      fc.property(hArb, inputArb, (h, input) => {
        expect(toHex(ghash(h, input))).toBe(toHex(nobleGhash(input, h)));
      }),
      { numRuns: RUNS },
    );
  });

  it('the traced producer equals noble ghash at block and bit detail', async () => {
    await fc.assert(
      fc.asyncProperty(hArb, inputArb, detailArb, async (h, input, detail) => {
        expect(await runGhash(h, input, detail)).toBe(toHex(nobleGhash(input, h)));
      }),
      { numRuns: RUNS },
    );
  });
});
