import { i18nRef, valueId, type DerivationFacet, type DerivationGroup, type DerivationNode } from '@cryventure/core';
import { rcon, rotWord, subWord, WORDS_PER_ROUND_KEY, xorWords, type KeySchedule, type Word } from './keyExpansion.ts';

/**
 * The AES key schedule (FIPS 197 §5.2) as a `derivation@default` facet.
 *
 * Convention: every schedule word w[i] is a *result* node (`result: true`) carrying `group` (= round
 * key index ⌊i/4⌋, labelled by `groups`), `step` and `valueRef`; intermediate nodes (RotWord, SubWord,
 * Rcon, ⊕Rcon) carry none of them and only appear inside a word's derivation chain. A result node's
 * FIRST input is the main chain (the temp word), further inputs are XOR operands (w[i−Nk]).
 */
const LABEL_PREFIX = 'plugin.aes.derivation.';

/** Round key index → state step at which it is first used (rounds without an entry are unknown). */
export type RoundKeySteps = ReadonlyMap<number, number>;

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

  constructor(private readonly roundKeySteps: RoundKeySteps) {}

  part(spec: PartSpec): Computed {
    const { id, op, label, labelIndex, bytes, inputs } = spec;
    this.nodes.push({ id, label: i18nRef(LABEL_PREFIX + label, { i: labelIndex }), bytes: [...bytes], op, inputs });
    return { id, bytes };
  }

  word(i: number, op: string, bytes: Word, inputs: string[], label: string): Computed {
    const group = Math.floor(i / WORDS_PER_ROUND_KEY);
    const step = this.roundKeySteps.get(group);
    const id = wordNodeId(i);
    this.nodes.push({
      id,
      label: i18nRef(LABEL_PREFIX + label, { i }),
      bytes: [...bytes],
      op,
      inputs,
      group,
      result: true,
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

/** One group per round key, labelled "Round key n". */
function roundKeyGroups(rounds: number): DerivationGroup[] {
  return Array.from({ length: rounds + 1 }, (_, n) => ({ id: n, label: i18nRef(`${LABEL_PREFIX}roundKey`, { n }) }));
}

/**
 * KeyExpansion as a topologically ordered DAG: Nk key words, then each w[i] after its inputs.
 * Word bytes come from the shared `schedule`; only the intermediates are computed here.
 */
export function keyScheduleDerivation(schedule: KeySchedule, roundKeySteps: RoundKeySteps = new Map()): DerivationFacet {
  const { keyWords: nk, rounds, words: scheduleWords } = schedule;
  const builder = new DerivationBuilder(roundKeySteps);
  const words: Computed[] = [];
  scheduleWords.forEach((bytes, i) => {
    if (i < nk) {
      words.push(builder.word(i, 'input', bytes, [], 'keyWord'));
      return;
    }
    const temp = tempFor(builder, words[i - 1]!, i, nk);
    words.push(builder.word(i, 'xor', bytes, [temp.id, words[i - nk]!.id], 'word'));
  });
  return { kind: 'derivation', schemaVersion: 1, nodes: builder.nodes, groups: roundKeyGroups(rounds) };
}
