import {
  getFacet,
  registersAt,
  toHex,
  type I18nRef,
  type SpongeFacet,
  type TraceBundle,
} from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import {
  indicesOf,
  isaFacetProblems,
  isaFacets,
  unknownValueRefs,
  writtenBy,
  type IsaFacets,
} from '../_lib/fixtures/isaChecks.ts';
import {
  SHA3_FIXTURE_PRESETS,
  sharedSha3FixtureBundle,
  type Sha3FixturePreset,
} from '../_lib/keccak/fixtures/keccakBundles.ts';
import { registersAfterEach } from '../_lib/keccak/fixtures/keccakChecks.ts';
import { keccakTrace, laneBytes } from '../_lib/keccak/keccakTrace.ts';
import { armSimdRegister } from '../_lib/listing.ts';
import de from './i18n/de.json';
import en from './i18n/en.json';
import { derive } from './module.ts';

const VARIANT = 'aarch64-armv8-sha3';
/** 21 prologue + 86 body (one round) + 25 epilogue instructions. */
const PROLOGUE = 21;
const BODY = 86;
const EPILOGUE = 25;
const PER_PERMUTATION = PROLOGUE + 24 * BODY + EPILOGUE;

/** Lane → register at the loop's entry and at its back branch (the listing's loop-carried assignment). */
const LANE_REGISTERS = [
  'v8',
  'v11',
  'v14',
  'v2',
  'v4',
  'v5',
  'v6',
  'v17',
  'v7',
  'v22',
  'v19',
  'v18',
  'v28',
  'v23',
  'v25',
  'v3',
  'v15',
  'v16',
  'v29',
  'v21',
  'v24',
  'v26',
  'v30',
  'v20',
  'v31',
];

/** Digests (NIST FIPS 202 examples / CAVP) and the number of permutations per preset. */
const EXPECTED: Record<Sha3FixturePreset, { digest: string; permutations: number }> = {
  'sha3-256-abc': {
    digest: '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532',
    permutations: 1,
  },
  'sha3-256-empty': {
    digest: 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
    permutations: 1,
  },
  'sha3-256-1600': {
    digest: '79f38adec5c20307a98ef76e8324afbfd46cfd81b22e3973c65fa1bd9de31787',
    permutations: 2,
  },
  'shake128-abc-336': {
    digest: '5881092dd818bf5cf8a3ddb793fbcba74097d5c526a6d35f97b83351940f2cc8',
    permutations: 2,
  },
};

const sponge = (bundle: TraceBundle) => getFacet<SpongeFacet>(bundle, 'sponge')!;
const lowLane = (hex: string): number[] => [...laneBytes(hex), ...new Array<number>(8).fill(0)];

/** The bytes the epilogue of permutation `permutation` stores (str/stp to x0), as A in memory. */
function storedState(
  facets: IsaFacets,
  after: readonly Map<string, number[]>[],
  permutation: number,
): number[] {
  const memory = new Array<number>(200).fill(-1);
  facets.instructions.instructions.forEach((store, index) => {
    if (Math.floor(index / PER_PERMUTATION) !== permutation) return;
    if (store.mnemonic !== 'stp' && store.mnemonic !== 'str') return;
    store.writes.forEach((target, operand) => {
      const source = store.reads[operand]!;
      if (target.kind !== 'mem' || target.base !== 'x0' || source.kind !== 'reg') return;
      const bytes = after[index]!.get(source.name)!.slice(0, target.size);
      memory.splice(target.offset, bytes.length, ...bytes);
    });
  });
  return memory;
}

describe.each(SHA3_FIXTURE_PRESETS)('isa-armv8-sha3 derive (%s)', (preset) => {
  const bundle = sharedSha3FixtureBundle(preset);
  const facets = isaFacets(derive(bundle), VARIANT);
  const instructions = facets.instructions.instructions;
  const trace = keccakTrace(bundle);
  const expected = EXPECTED[preset];
  const after = registersAfterEach(facets);

  it('passes the core validators and alignIssues (spans never decrease), with known valueRefs', () => {
    expect(isaFacetProblems(facets, bundle)).toEqual([]);
    expect(unknownValueRefs(facets, bundle)).toEqual([]);
  });

  it('runs the function once per permutation and its body once per round', () => {
    expect(trace.permutations).toHaveLength(expected.permutations);
    expect(instructions).toHaveLength(expected.permutations * PER_PERMUTATION);
    const perRound = { eor3: 10, rax1: 5, xar: 25, bcax: 25 };
    Object.entries(perRound).forEach(([mnemonic, count]) =>
      expect(indicesOf(facets, mnemonic)).toHaveLength(count * 24 * expected.permutations),
    );
  });

  it('holds the 25 lanes in their loop registers after round 0 and after round 23 (the ι-step lanes)', () => {
    for (const permutation of trace.permutations)
      for (const round of [0, 23]) {
        const iota = permutation.rounds[round]!.iota;
        const registers = registersAt(facets.registers, iota.step);
        const held = LANE_REGISTERS.map((name) => toHex(registers.get(name)!));
        expect(held).toEqual(iota.lanes.map((lane) => toHex(lowLane(lane))));
      }
  });

  it('stores the permuted state: what each squeeze reads, so the squeezed rates begin with the digest', () => {
    const steps = sponge(bundle).steps;
    const rateBytes = sponge(bundle).rateLanes * 8;
    let squeezed = '';
    trace.permutations.forEach((permutation, index) => {
      const stored = storedState(facets, after, index);
      expect(stored).toEqual(permutation.rounds[23]!.iota.lanes.flatMap(laneBytes));
      const next = steps.find((step) => step.step === permutation.exit)!;
      if (next.phase !== 'squeeze') return;
      expect(next.output).toBe(toHex(stored.slice(0, rateBytes)));
      squeezed += toHex(stored.slice(0, rateBytes));
    });
    expect(squeezed.startsWith(expected.digest)).toBe(true);
  });

  it('writes θ partial and C (eor3), D (rax1), the ρ lanes (xar), χ (bcax) and ι as the trace records them', () => {
    // writtenBy pairs instructions with their own registers step; valid in the first permutation's
    // rounds (the only register writes without a step, the callee-saved restores, come after them).
    const round0 = trace.permutations[0]!.rounds[0]!;
    const theta = round0.theta.theta!;
    const valueOf = (index: number) =>
      toHex(writtenBy(facets, index, armSimdRegister(instructions[index]!.operands[0]!)!));
    const body = Array.from({ length: BODY }, (_, offset) => PROLOGUE + offset);
    const ofMnemonic = (mnemonic: string) =>
      body.filter((index) => instructions[index]!.mnemonic === mnemonic);
    const params = (index: number) =>
      instructions[index]!.covers![0]!.params as Record<string, number>;
    const lane = (hex: string) => toHex(lowLane(hex));
    ofMnemonic('eor3').forEach((index) => {
      const { x } = params(index);
      const partial = instructions[index]!.covers![0]!.key.endsWith('parityPartial');
      expect(valueOf(index)).toBe(lane((partial ? theta.partial! : theta.c)[x!]!));
    });
    ofMnemonic('rax1').forEach((index) =>
      expect(valueOf(index)).toBe(lane(theta.d[params(index).x!]!)),
    );
    ofMnemonic('xar').forEach((index) => {
      const { sx, sy } = params(index);
      expect(valueOf(index)).toBe(lane(round0.rho.lanes[sx! + 5 * sy!]!));
    });
    ofMnemonic('bcax').forEach((index) => {
      const { x, y } = params(index);
      expect(valueOf(index)).toBe(lane(round0.chi.lanes[x! + 5 * y!]!));
    });
    const [iota] = ofMnemonic('eor');
    expect(valueOf(iota!)).toBe(lane(round0.iota.lanes[0]!));
    const [rcLoad] = body.filter((index) => instructions[index]!.address === '0x144');
    expect(valueOf(rcLoad!)).toBe(lane(round0.iota.iota!.rc));
  });

  it('places xar on θ … π, bcax on χ, ι on ι; the late xar and the RC load zero-width at χ', () => {
    const round = trace.permutations[0]!.rounds[5]!;
    const body = instructions.slice(PROLOGUE + 5 * BODY, PROLOGUE + 6 * BODY);
    const spans = (mnemonic: string) =>
      body.filter((instruction) => instruction.mnemonic === mnemonic).map((i) => i.align);
    const chi = { first: round.chi.step, last: round.chi.step };
    const xar = spans('xar');
    expect(xar.slice(0, 24)).toEqual(
      new Array(24).fill({ first: round.theta.step, last: round.pi.step }),
    );
    expect(xar[24]).toEqual(chi);
    expect(body.find((i) => i.address === '0x124')!.covers![0]!.params).toMatchObject({
      x: 4,
      y: 4,
    });
    expect(spans('bcax')).toEqual(new Array(25).fill(chi));
    expect(spans('eor3')).toEqual(
      new Array(10).fill({ first: round.theta.step, last: round.theta.step }),
    );
    expect(spans('eor')).toEqual([{ first: round.iota.step, last: round.iota.step }]);
    expect(body.find((i) => i.address === '0x144')!.align).toEqual(chi);
  });
});

describe('isa-armv8-sha3 notes and catalogs', () => {
  const facets = isaFacets(derive(sharedSha3FixtureBundle('sha3-256-abc')), VARIANT);
  const refs = facets.instructions.instructions.flatMap((instruction): I18nRef[] => [
    ...(instruction.covers ?? []),
    ...(instruction.note === undefined ? [] : [instruction.note]),
  ]);

  it('references only keys both catalogs have, with the params they use', () => {
    const keys = new Set(refs.map((ref) => ref.key));
    expect([...keys].filter((key) => !(key in en) || !(key in de))).toEqual([]);
    expect(Object.keys(en).filter((key) => key.includes('.note.') && !keys.has(key))).toEqual([]);
  });

  it('notes the late xar and the spill', () => {
    const noteAt = (address: string) =>
      facets.instructions.instructions.find((i) => i.address === address)!.note?.key;
    expect(noteAt('0x124')).toBe('deriver.isa-armv8-sha3.note.xarLate');
    expect(noteAt('0xb8')).toBe('deriver.isa-armv8-sha3.note.xarNoRotation');
    expect(noteAt('0x5c')).toBe('deriver.isa-armv8-sha3.note.spill');
    expect(noteAt('0x10c')).toBe('deriver.isa-armv8-sha3.note.reload');
  });
});
