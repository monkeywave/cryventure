import { i18nRef, valueId, type DerivationFacet, type DerivationNode } from '@cryventure/core';
import { rcon, rotWord, subWord, WORDS_PER_ROUND_KEY, xorWords, type Word } from './keyExpansion.ts';

/**
 * The AES key schedule (FIPS 197 §5.2) as a `derivation@default` facet.
 *
 * Convention: every schedule word w[i] is a *primary* node carrying `group` (= round key index
 * ⌊i/4⌋), `step` and `valueRef`; intermediate nodes (RotWord, SubWord, Rcon, ⊕Rcon) carry none of
 * them and only appear inside a word's derivation chain. A primary node's FIRST input is the
 * main chain (the temp word), further inputs are XOR operands (w[i−Nk]).
 */
const LABEL_PREFIX = 'plugin.aes.derivation.';

/** State step at which round key `round` is first used, or `undefined` when unknown. */
export type RoundKeyStepLookup = (round: number) => number | undefined;

export function wordNodeId(i: number): string {
  return valueId(['w'], String(i));
}

function partNodeId(i: number, part: string): string {
  return valueId(['w', i], part);
}

export function rconNodeId(j: number): string {
  return valueId(['rcon'], String(j));
}

interface Computed {
  id: string;
  bytes: Word;
}

interface PartSpec {
  id: string;
  op: string;
  label: string;
  labelIndex: number;
  bytes: Word;
  inputs: string[];
}

class DerivationBuilder {
  readonly nodes: DerivationNode[] = [];

  constructor(private readonly stepOf: RoundKeyStepLookup) {}

  part(spec: PartSpec): Computed {
    const { id, op, label, labelIndex, bytes, inputs } = spec;
    this.nodes.push({ id, label: i18nRef(LABEL_PREFIX + label, { i: labelIndex }), bytes: [...bytes], op, inputs });
    return { id, bytes };
  }

  word(i: number, op: string, bytes: Word, inputs: string[], label: string): Computed {
    const group = Math.floor(i / WORDS_PER_ROUND_KEY);
    const step = this.stepOf(group);
    const id = wordNodeId(i);
    this.nodes.push({
      id,
      label: i18nRef(LABEL_PREFIX + label, { i }),
      bytes: [...bytes],
      op,
      inputs,
      group,
      valueRef: valueId([group], 'roundKey'),
      ...(step === undefined ? {} : { step }),
    });
    return { id, bytes };
  }
}

/** temp = SubWord(RotWord(w[i−1])) ⊕ Rcon[i/Nk], with every intermediate as its own node. */
function roundConstantTemp(builder: DerivationBuilder, previous: Computed, i: number, nk: number): Computed {
  const j = i / nk;
  const rotated = builder.part({ id: partNodeId(i, 'rotWord'), op: 'rotWord', label: 'rotWord', labelIndex: i, bytes: rotWord(previous.bytes), inputs: [previous.id] });
  const substituted = builder.part({ id: partNodeId(i, 'subWord'), op: 'subWord', label: 'subWord', labelIndex: i, bytes: subWord(rotated.bytes), inputs: [rotated.id] });
  const constant = builder.part({ id: rconNodeId(j), op: 'rcon', label: 'rcon', labelIndex: j, bytes: rcon(j), inputs: [] });
  return builder.part({
    id: partNodeId(i, 'xorRcon'),
    op: 'xor',
    label: 'xorRcon',
    labelIndex: i,
    bytes: xorWords(substituted.bytes, constant.bytes),
    inputs: [substituted.id, constant.id],
  });
}

/** The temp word fed into w[i] (FIPS 197 Algorithm 2), adding intermediate nodes where needed. */
function tempFor(builder: DerivationBuilder, previous: Computed, i: number, nk: number): Computed {
  if (i % nk === 0) return roundConstantTemp(builder, previous, i, nk);
  if (nk > 6 && i % nk === 4) {
    return builder.part({ id: partNodeId(i, 'subWord'), op: 'subWord', label: 'subWord', labelIndex: i, bytes: subWord(previous.bytes), inputs: [previous.id] });
  }
  return previous;
}

function keyWord(key: ArrayLike<number>, i: number): Word {
  return Array.from({ length: 4 }, (_, b) => key[4 * i + b] ?? 0);
}

/** KeyExpansion as a topologically ordered DAG: Nk key words, then each w[i] after its inputs. */
export function keyScheduleDerivation(key: ArrayLike<number>, rounds: number, stepOf: RoundKeyStepLookup): DerivationFacet {
  const nk = key.length / 4;
  const builder = new DerivationBuilder(stepOf);
  const words: Computed[] = [];
  for (let i = 0; i < nk; i++) words.push(builder.word(i, 'input', keyWord(key, i), [], 'keyWord'));
  for (let i = nk; i < WORDS_PER_ROUND_KEY * (rounds + 1); i++) {
    const temp = tempFor(builder, words[i - 1]!, i, nk);
    const back = words[i - nk]!;
    words.push(builder.word(i, 'xor', xorWords(back.bytes, temp.bytes), [temp.id, back.id], 'word'));
  }
  return { kind: 'derivation', schemaVersion: 1, nodes: builder.nodes };
}
