import { facetKey, formatHexAddress, parseHexAddress, type Allocation, type FacetKey, type MemoryFacet, type MemoryWrite, type StructLayout } from '@cryventure/core';
import { withValueRef } from '../_lib/valueRef.ts';
import type { AesRun } from './aesContract.ts';
import { bindAesKey, requireField } from './bindAesKey.ts';
import { aesKeyLayoutFor, bindLayout, targetImplPairs, targetSpec, type ImplSpec, type TargetData } from './data.ts';
import { modeledStackFrame } from './stackFrame.ts';

/**
 * The modeled program (docs/M4.md §4): one stack frame `unsigned char in[16], out[16]; AES_KEY key;`.
 * `in` holds the plaintext from the start, `key` is filled by `AES_set_encrypt_key` at the
 * keyExpansion step, `out` receives the ciphertext at the output step.
 */

const NS = 'deriver.memory';
const BLOCK_BYTES = 16;
const BUFFER_ALIGN = 16;
const ROUND_KEY_BYTES = 16;
const INITIAL_STEP = -1;

/** Facet variant of one target + impl, e.g. `x86_64-linux-gnu+c-ref`. */
export function memoryVariant(triple: string, implId: string): string {
  return `${triple}+${implId}`;
}

/** Label key of a variant, e.g. `deriver.memory.variant.x86_64-linux-gnu.c-ref`. */
export function variantLabelKey(triple: string, implId: string): string {
  return `${NS}.variant.${triple}.${implId}`;
}

/** Label key of an implementation, e.g. `deriver.memory.impl.aesni`. */
export function implLabelKey(implId: string): string {
  return `${NS}.impl.${implId}`;
}

function stackAllocation(id: string, addr: string, size: number, align = BUFFER_ALIGN): Allocation {
  return { id, space: 'stack', addr, size, align, label: { key: `${NS}.allocation.${id}` }, allocatedAt: INITIAL_STEP };
}

/**
 * `key` declares its type's real alignment (`alignof(AES_KEY)` from the layout, 4), so the view
 * never shows two alignments for one object. The modeled frame still puts it on a 16-aligned slot
 * (`frameAlign`), which satisfies any weaker alignment.
 */
function keyAllocation(run: AesRun, target: TargetData, impl: ImplSpec, addr: string): Allocation & { layout: StructLayout } {
  const layout = bindLayout(aesKeyLayoutFor(target.triple), impl);
  const refs = run.roundKeys.map(({ valueId }, round) => ({ offset: round * ROUND_KEY_BYTES, size: ROUND_KEY_BYTES, valueRef: valueId }));
  return withValueRef({ ...stackAllocation('key', addr, layout.size, layout.align), layout, refs }, run.valueIds.key);
}

function offsetAddress(base: string, offset: number): string {
  return formatHexAddress(parseHexAddress(base) + BigInt(offset));
}

function addressOf(addresses: ReadonlyMap<string, string>, id: string): string {
  const address = addresses.get(id);
  if (address === undefined) throw new Error(`memory: no stack slot "${id}"`);
  return address;
}

/** The `AES_set_encrypt_key` writes: the used part of `rd_key`, then `rounds`. */
function keyWrites(run: AesRun, key: Allocation & { layout: StructLayout }, impl: ImplSpec, endian: TargetData['endian']): MemoryWrite[] {
  const { layout } = key;
  const bytes = Array.from(bindAesKey(layout, impl, run.roundKeys.map(({ bytes: roundKey }) => roundKey), run.rounds, endian));
  const align = { first: run.steps.keyExpansion, last: run.steps.keyExpansion };
  const rdKey = requireField(layout, 'rd_key');
  const roundsField = requireField(layout, 'rounds');
  const scheduleLength = run.roundKeys.length * ROUND_KEY_BYTES;
  return [
    { align, addr: offsetAddress(key.addr, rdKey.offset), bytes: bytes.slice(rdKey.offset, rdKey.offset + scheduleLength) },
    { align: { ...align }, addr: offsetAddress(key.addr, roundsField.offset), bytes: bytes.slice(roundsField.offset, roundsField.offset + roundsField.size) },
  ];
}

function blockWrite(addr: string, bytes: number[], step: number, valueRef: string | undefined): MemoryWrite {
  return withValueRef({ align: { first: step, last: step }, addr, bytes: [...bytes] }, valueRef);
}

/** The memory facet of one AES run on one target + implementation. */
export function buildMemoryFacet(run: AesRun, target: TargetData, impl: ImplSpec): MemoryFacet {
  const keySize = aesKeyLayoutFor(target.triple).size;
  const slots = [
    { id: 'in', size: BLOCK_BYTES },
    { id: 'out', size: BLOCK_BYTES },
    { id: 'key', size: keySize },
  ];
  const addresses = modeledStackFrame(target.stack, slots);
  const input = withValueRef(stackAllocation('in', addressOf(addresses, 'in'), BLOCK_BYTES), run.valueIds.plaintext);
  const output = withValueRef(stackAllocation('out', addressOf(addresses, 'out'), BLOCK_BYTES), run.valueIds.ciphertext);
  const key = keyAllocation(run, target, impl, addressOf(addresses, 'key'));
  return {
    kind: 'memory',
    schemaVersion: 1,
    label: { key: variantLabelKey(target.triple, impl.id) },
    provenance: 'modeled',
    target: targetSpec(target),
    impl: { id: impl.id, label: { key: implLabelKey(impl.id) } },
    allocations: [input, output, key],
    writes: [
      blockWrite(input.addr, run.plaintext, INITIAL_STEP, run.valueIds.plaintext),
      ...keyWrites(run, key, impl, target.endian),
      blockWrite(output.addr, run.ciphertext, run.steps.output, run.valueIds.ciphertext),
    ],
  };
}

/** Every memory variant of one AES run, x86_64 first (`memory@<triple>+<impl>`). */
export function memoryFacets(run: AesRun): Partial<Record<FacetKey, MemoryFacet>> {
  return Object.fromEntries(targetImplPairs().map(({ target, impl }) => [facetKey('memory', memoryVariant(target.triple, impl.id)), buildMemoryFacet(run, target, impl)]));
}
