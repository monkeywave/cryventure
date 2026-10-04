import {
  AES_POLYNOMIAL,
  allIndices,
  bitOf,
  i18nRef,
  INITIAL_STEP_INDEX,
  mathTerm,
  type DerivationFacet,
  type LabZoom,
  type MathFacet,
  type MathStep,
  type MathTermOptions,
  type MathTermRole,
  type ValuesFacet,
} from '@cryventure/core';
import { DerivationBuilder, type DerivationNodeSpec } from '../_lib/derivation.ts';
import { nonEmptyValueRef } from '../_lib/values.ts';
import { IPAD, OPAD } from '../_lib/hmac/hmac.ts';
import type { HmacComputation } from './hmacCompute.ts';
import type { HmacSteps } from './hmacTrace.ts';

/** The values, derivation and math facets of an HMAC recording (docs/M7.md §2b). */
const NS = 'plugin.hmac';

/** The step at which the final tag exists: after truncation, else after the outer hash. */
export function tagStep(steps: HmacSteps): number {
  return steps.truncate ?? steps.outer;
}

export function hmacValues(computation: HmacComputation, steps: HmacSteps, expected: readonly number[] | undefined): ValuesFacet {
  const { key, message, k0, inner, outer, tag } = computation;
  const values = [
    ...nonEmptyValueRef(NS, 'key', 'key', key, INITIAL_STEP_INDEX),
    ...nonEmptyValueRef(NS, 'message', 'public', message, INITIAL_STEP_INDEX),
    ...nonEmptyValueRef(NS, 'expected', 'public', expected, INITIAL_STEP_INDEX),
    ...nonEmptyValueRef(NS, 'k0', 'secret', k0, steps.keyPrep),
    ...nonEmptyValueRef(NS, 'ipadKey', 'secret', inner.paddedKey, steps.ipad),
    ...nonEmptyValueRef(NS, 'innerState', 'secret', inner.midstate, steps.innerBlock),
    ...nonEmptyValueRef(NS, 'inner', 'state', inner.digest, steps.innerMessage),
    ...nonEmptyValueRef(NS, 'opadKey', 'secret', outer.paddedKey, steps.opad),
    ...nonEmptyValueRef(NS, 'outerState', 'secret', outer.midstate, steps.outerBlock),
    ...nonEmptyValueRef(NS, 'tag', 'public', tag, tagStep(steps)),
  ];
  return { kind: 'values', schemaVersion: 1, values };
}

/** Zoom links for the two hash calls: `zoom(message)` → the hash lab hashing `message`, if it can. */
export type HashZoomOf = (message: readonly number[]) => LabZoom | undefined;

type NodeOptions = Pick<DerivationNodeSpec, 'result' | 'valueRef' | 'step' | 'zoom'>;

/** Adds the node `id`, labelled `<ns>.derivation.<id>`. */
function addNode(builder: DerivationBuilder, id: string, op: string, bytes: readonly number[], inputs: string[], options: NodeOptions = {}): string {
  return builder.add({ id, label: id, bytes, op, inputs, ...options });
}

/** The valueRef of `name` when the values facet holds it (empty values are omitted). */
const refIf = (name: string, bytes: readonly number[]) => (bytes.length > 0 ? name : undefined);

/** K → K0: as is, K ‖ 0…, or H(K) ‖ 0… (the hashed key's node first, linked to the hash lab). */
function addK0(builder: DerivationBuilder, computation: HmacComputation, steps: HmacSteps, zoom: HashZoomOf): string {
  const { key, k0, branch, keyDigest } = computation;
  const keyId = addNode(builder, 'key', 'input', key, [], { result: true, valueRef: refIf('key', key), step: INITIAL_STEP_INDEX });
  const source = keyDigest === undefined ? keyId : addNode(builder, 'keyDigest', 'hash', keyDigest, [keyId], { step: steps.keyPrep, zoom: zoom(key) });
  if (branch === 'exact') return addNode(builder, 'k0', 'input', k0, [source], { result: true, valueRef: 'k0', step: steps.keyPrep });
  const sourceLength = keyDigest?.length ?? key.length;
  const zeros = addNode(builder, 'zeros', 'input', k0.slice(sourceLength), []);
  return addNode(builder, 'k0', 'concat', k0, [source, zeros], { result: true, valueRef: 'k0', step: steps.keyPrep });
}

/** One HMAC half in the DAG: its K0 node, the data node it hashes after the pad block, and whether its hash is the tag. */
interface HalfInput {
  half: 'inner' | 'outer';
  k0: string;
  data: { id: string; bytes: readonly number[] };
  isTag: boolean;
}

/** K0 ⊕ pad → (K0 ⊕ pad) ‖ data → H(…), the hash node zooming into the hash lab. */
function addHalf(builder: DerivationBuilder, computation: HmacComputation, steps: HmacSteps, zoom: HashZoomOf, { half, k0, data, isTag }: HalfInput): string {
  const { paddedKey, digest } = computation[half];
  const inner = half === 'inner';
  const pad = inner ? 'ipad' : 'opad';
  const padId = addNode(builder, pad, 'input', new Array<number>(paddedKey.length).fill(inner ? IPAD : OPAD), []);
  const keyId = addNode(builder, `${pad}Key`, 'xor', paddedKey, [k0, padId], { result: true, valueRef: `${pad}Key`, step: inner ? steps.ipad : steps.opad });
  const hashInput = [...paddedKey, ...data.bytes];
  const inputId = addNode(builder, `${half}Input`, 'concat', hashInput, [keyId, data.id]);
  const valueName = isTag ? 'tag' : inner ? 'inner' : undefined;
  return addNode(builder, isTag ? 'tag' : half, 'hash', digest, [inputId], { result: true, valueRef: valueName, step: inner ? steps.innerMessage : steps.outer, zoom: zoom(hashInput) });
}

/** key → K0 → ipad/opad keys → inner → (outer →) tag; every hash node (key hash, inner, outer) links to the hash lab. */
export function hmacDerivation(computation: HmacComputation, steps: HmacSteps, zoom: HashZoomOf): DerivationFacet {
  const builder = new DerivationBuilder(NS);
  const k0 = addK0(builder, computation, steps, zoom);
  const { message, inner, tag } = computation;
  const messageId = addNode(builder, 'message', 'input', message, [], { result: true, valueRef: refIf('message', message), step: INITIAL_STEP_INDEX });
  const truncated = steps.truncate !== undefined;
  const innerId = addHalf(builder, computation, steps, zoom, { half: 'inner', k0, data: { id: messageId, bytes: message }, isTag: false });
  const outerId = addHalf(builder, computation, steps, zoom, { half: 'outer', k0, data: { id: innerId, bytes: inner.digest }, isTag: !truncated });
  if (truncated) addNode(builder, 'tag', 'truncate', tag, [outerId], { result: true, valueRef: 'tag', step: steps.truncate });
  return { kind: 'derivation', schemaVersion: 1, nodes: builder.nodes, title: i18nRef(`${NS}.derivation.title`) };
}

const BYTE_BITS = 8;

/** Set bit positions of a byte (0 = LSB). */
function setBits(value: number): number[] {
  return allIndices(BYTE_BITS).filter((bit) => bitOf(value, bit) === 1);
}

function term(id: string, value: number, role: MathTermRole, options: MathTermOptions = {}) {
  return mathTerm(id, i18nRef(`${NS}.term.${id}`), value, BYTE_BITS, role, options);
}

/**
 * Bit strips of the pads on the `ipad` and `opad` steps: K0[0] ⊕ 36, then K0[0] ⊕ 5c and
 * (K0 ⊕ ipad) ⊕ (K0 ⊕ opad) = 36 ⊕ 5c = 6a, whose four set bits are where the two pads differ.
 */
export function hmacMath(computation: HmacComputation, steps: HmacSteps): MathFacet {
  const first = computation.k0[0] ?? 0;
  const ipadKey = first ^ IPAD;
  const opadKey = first ^ OPAD;
  const difference = IPAD ^ OPAD;
  const ipadStep: MathStep = {
    step: steps.ipad,
    formula: i18nRef(`${NS}.formula.ipad`),
    terms: [term('k0Byte', first, 'operand'), term('ipad', IPAD, 'constant', { op: 'xor', bits: setBits(IPAD) }), term('ipadKeyByte', ipadKey, 'result', { op: 'result' })],
  };
  const opadStep: MathStep = {
    step: steps.opad,
    formula: i18nRef(`${NS}.formula.opad`),
    terms: [
      term('k0Byte', first, 'operand'),
      term('opad', OPAD, 'constant', { op: 'xor', bits: setBits(OPAD) }),
      term('opadKeyByte', opadKey, 'intermediate', { op: 'result' }),
      term('ipadKeyByte', ipadKey, 'intermediate', { op: 'xor' }),
      term('padDifference', difference, 'result', { op: 'result', bits: setBits(difference) }),
    ],
  };
  return { kind: 'math', schemaVersion: 1, notation: { field: 'gf2^8', modulus: AES_POLYNOMIAL }, steps: [ipadStep, opadStep] };
}
