import { describe, expect, it } from 'vitest';
import { isWordOp, isWordTermRole, validateWordopsFacet, WORD_OPS, WORD_TERM_ROLES, type WordopsFacet, type WordopsStep, type WordTerm } from './wordops.ts';

const ref = (key: string) => ({ key });
const registerNames = ['a', 'b'];

function validFacet(): WordopsFacet {
  return {
    kind: 'wordops',
    schemaVersion: 1,
    wordBits: 32,
    registerNames,
    steps: [
      {
        step: -1,
        formula: ref('plugin.sha256.formula.init'),
        terms: [{ id: 'a', label: ref('plugin.sha256.term.a'), hex: '6a09e667', role: 'constant' }],
        registers: { before: ['00000000', '00000000'], after: ['6a09e667', 'bb67ae85'] },
      },
      {
        step: 0,
        formula: { key: 'plugin.sha256.formula.T1', params: { t: 0 } },
        terms: [
          { id: 'Sigma1', label: ref('plugin.sha256.term.Sigma1'), hex: '3587272b', role: 'intermediate', op: 'Sigma1', valueRef: 'v.sigma1' },
          { id: 'T1', label: ref('plugin.sha256.term.T1'), hex: '0c657a79', role: 'result', op: 'add' },
        ],
      },
    ],
  };
}

function withStep(change: Partial<WordopsStep>, index = 1): WordopsFacet {
  const facet = validFacet();
  facet.steps[index] = { ...facet.steps[index]!, ...change };
  return facet;
}

describe('validateWordopsFacet', () => {
  it('accepts a valid facet, with and without stepCount', () => {
    expect(validateWordopsFacet(validFacet())).toEqual([]);
    expect(validateWordopsFacet(validFacet(), 1)).toEqual([]);
  });

  it('accepts 64-bit words and a facet without registers', () => {
    const facet: WordopsFacet = {
      kind: 'wordops',
      schemaVersion: 1,
      wordBits: 64,
      steps: [{ step: 3, formula: ref('f'), terms: [{ id: 'h', label: ref('l'), hex: '6a09e667f3bcc908', role: 'constant' }] }],
    };
    expect(validateWordopsFacet(facet)).toEqual([]);
  });

  it('rejects a wordBits other than 32 or 64', () => {
    const facet = { ...validFacet(), wordBits: 16 } as unknown as WordopsFacet;
    expect(validateWordopsFacet(facet)).toEqual(['wordops: wordBits 16 is not 32 or 64']);
  });

  it('rejects hex of the wrong length', () => {
    const term = { ...validFacet().steps[1]!.terms[0]!, hex: '3587272b00' };
    expect(validateWordopsFacet(withStep({ terms: [term] }))).toEqual(['wordops step 0 term "Sigma1": hex "3587272b00" is not 8 lowercase hex digits']);
  });

  it('rejects uppercase and non-hex digits', () => {
    const upper = { ...validFacet().steps[1]!.terms[0]!, hex: '3587272B' };
    const nonHex = { ...validFacet().steps[1]!.terms[1]!, hex: '0c657a7g' };
    expect(validateWordopsFacet(withStep({ terms: [upper, nonHex] }))).toEqual([
      'wordops step 0 term "Sigma1": hex "3587272B" is not 8 lowercase hex digits',
      'wordops step 0 term "T1": hex "0c657a7g" is not 8 lowercase hex digits',
    ]);
  });

  it('rejects 32-bit hex in a 64-bit facet', () => {
    const facet = { ...validFacet(), wordBits: 64 as const, registerNames: undefined, steps: [validFacet().steps[1]!] };
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step 0 term "Sigma1": hex "3587272b" is not 16 lowercase hex digits',
      'wordops step 0 term "T1": hex "0c657a79" is not 16 lowercase hex digits',
    ]);
  });

  it('rejects duplicate term ids within a step but allows them across steps', () => {
    const [first] = validFacet().steps[1]!.terms;
    expect(validateWordopsFacet(withStep({ terms: [first!, first!] }))).toEqual(['wordops step 0 term "Sigma1": duplicate id']);
    const across = withStep({ terms: [{ ...first!, id: 'a' }] });
    expect(validateWordopsFacet(across)).toEqual([]);
  });

  it('rejects non-increasing and non-integer steps', () => {
    expect(validateWordopsFacet(withStep({ step: -1 }))).toEqual(['wordops: step -1 does not increase (after -1)']);
    expect(validateWordopsFacet(withStep({ step: 0.5 }))).toEqual(['wordops: step 0.5 is not an integer ≥ -1']);
    expect(validateWordopsFacet(withStep({ step: -2 }))).toEqual(['wordops: step -2 is not an integer ≥ -1', 'wordops: step -2 does not increase (after -1)']);
  });

  it('rejects steps outside -1..stepCount-1 when stepCount is given', () => {
    expect(validateWordopsFacet(withStep({ step: 5 }), 5)).toEqual(['wordops: step 5 outside -1..4']);
    expect(validateWordopsFacet(withStep({ step: 5 }), 6)).toEqual([]);
    expect(validateWordopsFacet(withStep({ step: 5 }))).toEqual([]);
  });

  it('rejects registers without registerNames', () => {
    const facet = { ...validFacet(), registerNames: undefined };
    expect(validateWordopsFacet(facet)).toEqual(['wordops step -1: registers without registerNames']);
  });

  it('rejects registers whose before/after lengths differ from registerNames', () => {
    const facet = withStep({ registers: { before: ['00000000'], after: ['00000000', '00000000', '00000000'] } }, 0);
    expect(validateWordopsFacet(facet)).toEqual(['wordops step -1: registers.before has 1 words, expected 2', 'wordops step -1: registers.after has 3 words, expected 2']);
  });

  it('rejects register words that are not wordBits / 4 lowercase hex digits', () => {
    const facet = withStep({ registers: { before: ['0000000', '00000000'], after: ['ABCDEF01', '00000000'] } }, 0);
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step -1: registers.before[0] "0000000" is not 8 lowercase hex digits',
      'wordops step -1: registers.after[0] "ABCDEF01" is not 8 lowercase hex digits',
    ]);
  });

  it('rejects malformed I18nRefs in formulas and labels', () => {
    const badLabel = { ...validFacet().steps[1]!.terms[0]!, label: { key: '' } };
    const badParams = { ...validFacet().steps[1]!.terms[1]!, label: { key: 'k', params: { n: true } } } as unknown as WordopsStep['terms'][number];
    const facet = withStep({ formula: 'plain text' as unknown as WordopsStep['formula'], terms: [badLabel, badParams] });
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step 0 formula: not a well-formed I18nRef',
      'wordops step 0 term "Sigma1" label: not a well-formed I18nRef',
      'wordops step 0 term "T1" label: not a well-formed I18nRef',
    ]);
    const arrayParams = withStep({ formula: { key: 'k', params: [] as unknown as Record<string, string> } });
    expect(validateWordopsFacet(arrayParams)).toEqual(['wordops step 0 formula: not a well-formed I18nRef']);
  });
});

describe('validateWordopsFacet on malformed input (never throws)', () => {
  const malformed: [string, unknown][] = [
    ['null', null],
    ['a string', 'wordops'],
    ['an array', []],
    ['no steps', { kind: 'wordops', schemaVersion: 1, wordBits: 32 }],
    ['steps not an array', { kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: {} }],
    ['a null step', { kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [null] }],
    ['a step without terms', { kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [{ step: 0, formula: ref('f') }] }],
    ['a null term', { kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [{ step: 0, formula: ref('f'), terms: [null] }] }],
    ['a non-string hex', { kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [{ step: 0, formula: ref('f'), terms: [{ id: 'x', label: ref('l'), hex: 12, role: 'operand' }] }] }],
    ['a symbol hex', { kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [{ step: 0, formula: ref('f'), terms: [{ id: 'x', label: ref('l'), hex: Symbol('h'), role: 'operand' }] }] }],
    ['a string step', { kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [{ step: '0', formula: ref('f'), terms: [] }] }],
    ['registers without after', { kind: 'wordops', schemaVersion: 1, wordBits: 32, registerNames, steps: [{ step: 0, formula: ref('f'), terms: [], registers: { before: ['00000000', '00000000'] } }] }],
    ['registers null', { kind: 'wordops', schemaVersion: 1, wordBits: 32, registerNames, steps: [{ step: 0, formula: ref('f'), terms: [], registers: null }] }],
    ['registerNames not an array', { kind: 'wordops', schemaVersion: 1, wordBits: 32, registerNames: 'ab', steps: [{ step: 0, formula: ref('f'), terms: [], registers: { before: [], after: [] } }] }],
    ['v2 transfers not an array', { kind: 'wordops', schemaVersion: 2, wordBits: 32, registerNames, steps: [{ step: 0, formula: ref('f'), terms: [], registers: { before: ['00000000', '00000000'], after: ['00000000', '00000000'], transfers: 'x', touched: {} } }] }],
    ['a v2 transfer with a null source', { kind: 'wordops', schemaVersion: 2, wordBits: 32, registerNames, steps: [{ step: 0, formula: ref('f'), terms: [], registers: { before: ['00000000', '00000000'], after: ['00000000', '00000000'], transfers: [null, { to: 0, from: null }] } }] }],
  ];

  it.each(malformed)('returns problems instead of throwing for %s', (_name, facet) => {
    let problems: string[] = [];
    expect(() => { problems = validateWordopsFacet(facet as WordopsFacet); }).not.toThrow();
    expect(problems.length).toBeGreaterThan(0);
  });

  it('names the shape problem', () => {
    expect(validateWordopsFacet(null as unknown as WordopsFacet)).toEqual(['wordops: facet is not an object']);
    expect(validateWordopsFacet({ kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: {} } as unknown as WordopsFacet)).toEqual(['wordops: steps is not an array']);
    expect(validateWordopsFacet({ kind: 'wordops', schemaVersion: 1, wordBits: 32, steps: [null] } as unknown as WordopsFacet)).toEqual(['wordops steps[0]: not an object']);
  });
});

describe('WORD_OPS / WORD_TERM_ROLES', () => {
  it('lists every op, v1 and v2', () => {
    expect(WORD_OPS).toEqual(['rotr', 'rotl', 'shr', 'xor', 'and', 'not', 'add', 'ch', 'maj', 'Sigma0', 'Sigma1', 'sigma0', 'sigma1', 'root', 'or', 'parity', 'md5G', 'md5I']);
  });

  it('lists every term role', () => expect(WORD_TERM_ROLES).toEqual(['operand', 'intermediate', 'constant', 'carry', 'result']));

  it('recognises ops and roles only', () => {
    expect([isWordOp('md5I'), isWordOp('rotr2'), isWordOp('toString'), isWordOp(1)]).toEqual([true, false, false, false]);
    expect([isWordTermRole('carry'), isWordTermRole('input'), isWordTermRole(null)]).toEqual([true, false, false]);
  });
});

describe('validateWordopsFacet: term roles and ops', () => {
  it('rejects an empty id, an unknown role and an unknown op', () => {
    const [sigma, t1] = validFacet().steps[1]!.terms;
    const terms = [{ ...sigma!, id: '' }, { ...t1!, role: 'input' }, { ...t1!, id: 's', op: 'rotr2' }] as unknown as WordTerm[];
    expect(validateWordopsFacet(withStep({ terms }))).toEqual([
      'wordops step 0 term 0: id is not a non-empty string',
      'wordops step 0 term "T1": role "input" is not a MathTermRole',
      'wordops step 0 term "s": op "rotr2" is not a WordOp',
    ]);
  });

  it('rejects a schemaVersion other than 1 or 2', () => {
    expect(validateWordopsFacet({ ...validFacet(), schemaVersion: 3 })).toEqual(['wordops: schemaVersion 3 is not 1 or 2']);
  });
});

/** A v2 BLAKE2-like facet: four registers in a 2 × 2 grid, a step that adds v0 + v1 into v0 and swaps v2/v3. */
function v2Facet(): WordopsFacet {
  return {
    kind: 'wordops',
    schemaVersion: 2,
    wordBits: 32,
    registerNames: ['v0', 'v1', 'v2', 'v3'],
    registerColumns: 2,
    steps: [
      {
        step: 0,
        formula: ref('plugin.blake2.formula.g'),
        terms: [
          { id: 'a1', label: ref('plugin.blake2.term.a1'), hex: '00000003', role: 'result', op: 'add', emphasis: 'story' },
          { id: 'p', label: ref('plugin.blake2.term.p'), hex: '0000000f', role: 'intermediate', op: 'parity' },
          { id: 'r', label: ref('plugin.x.term.root'), hex: '6a09e667', role: 'constant', op: 'root', degree: 2 },
        ],
        registers: {
          before: ['00000001', '00000002', '0000000a', '0000000b'],
          after: ['00000003', '00000002', '0000000b', '0000000a'],
          touched: [0, 1, 2, 3],
          transfers: [
            { to: 0, from: { term: 'a1' } },
            { to: 2, from: { register: 3 } },
            { to: 3, from: { register: 2 } },
          ],
        },
      },
    ],
  };
}

function withV2Step(change: (step: WordopsStep) => void): WordopsFacet {
  const facet = v2Facet();
  change(facet.steps[0]!);
  return facet;
}

describe('validateWordopsFacet: schema v2', () => {
  it('accepts a valid v2 facet', () => expect(validateWordopsFacet(v2Facet(), 1)).toEqual([]));

  it('rejects every v2 field on a v1 facet', () => {
    expect(validateWordopsFacet({ ...v2Facet(), schemaVersion: 1 })).toEqual([
      'wordops: registerColumns needs schemaVersion 2',
      'wordops step 0 term "a1": emphasis needs schemaVersion 2',
      'wordops step 0 term "p": op "parity" needs schemaVersion 2',
      'wordops step 0 term "r": degree needs schemaVersion 2',
      'wordops step 0: registers.touched needs schemaVersion 2',
      'wordops step 0: registers.transfers needs schemaVersion 2',
    ]);
  });

  it('accepts the v1 ops on a v2 facet and the v2 ops or, md5G, md5I', () => {
    const facet = withV2Step((step) => {
      step.terms.push(...(['or', 'md5G', 'md5I', 'ch'] as const).map((op): WordTerm => ({ id: op, label: ref('l'), hex: '00000000', role: 'intermediate', op })));
    });
    expect(validateWordopsFacet(facet)).toEqual([]);
  });

  it('rejects a bad emphasis or degree, and a degree without op root', () => {
    const facet = withV2Step((step) => {
      step.terms[0] = { ...step.terms[0]!, emphasis: 'loud' as 'story' };
      step.terms[1] = { ...step.terms[1]!, degree: 2 };
      step.terms[2] = { ...step.terms[2]!, degree: 4 as 2 };
    });
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step 0 term "a1": emphasis "loud" is not "story"',
      'wordops step 0 term "p": degree needs op "root"',
      'wordops step 0 term "r": degree 4 is not 2 or 3',
    ]);
  });

  it('rejects a bad registerColumns, or one without registerNames', () => {
    expect(validateWordopsFacet({ ...v2Facet(), registerColumns: 0 })).toEqual(['wordops: registerColumns 0 is not a positive integer']);
    const noNames = { ...v2Facet(), registerNames: undefined, steps: [] };
    expect(validateWordopsFacet(noNames)).toEqual(['wordops: registerColumns without registerNames']);
  });

  it('rejects touched indices out of range, non-integers and duplicates', () => {
    const facet = withV2Step((step) => { step.registers!.touched = [0, 4, 1.5, 0]; });
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step 0: registers.touched 4 is not a register index',
      'wordops step 0: registers.touched 1.5 is not a register index',
      'wordops step 0: registers.touched has duplicates',
    ]);
  });

  it('rejects transfers with bad indices, a missing term, a malformed source and a duplicate target', () => {
    const facet = withV2Step((step) => {
      step.registers!.transfers = [
        { to: 4, from: { register: 0 } },
        { to: 1, from: { register: -1 } },
        { to: 1, from: { term: 'nope' } },
        { to: 2, from: {} as { term: string } },
      ];
    });
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step 0: registers.transfers[0]: to 4 is not a register index',
      'wordops step 0: registers.transfers[1]: from.register -1 is not a register index',
      'wordops step 0: registers.transfers[2]: from.term "nope" is not a term of the step',
      'wordops step 0: registers.transfers[3]: from is neither { register } nor { term }',
      'wordops step 0: registers.transfers writes register 1 twice',
    ]);
  });

  it('rejects transfers whose hex values disagree with after', () => {
    const facet = withV2Step((step) => {
      step.registers!.transfers = [
        { to: 0, from: { term: 'p' } },
        { to: 1, from: { register: 0 } },
      ];
    });
    expect(validateWordopsFacet(facet)).toEqual([
      'wordops step 0: registers.transfers[0]: after[0] "00000003" is not the source value "0000000f"',
      'wordops step 0: registers.transfers[1]: after[1] "00000002" is not the source value "00000001"',
    ]);
  });

  it('accepts a register that keeps its value (to = from.register)', () => {
    const facet = withV2Step((step) => { step.registers!.transfers = [{ to: 1, from: { register: 1 } }]; });
    expect(validateWordopsFacet(facet)).toEqual([]);
  });
});

describe('validateWordopsFacet: M6 review gaps', () => {
  it('rejects a facet of another kind', () => {
    expect(validateWordopsFacet({ ...validFacet(), kind: 'sponge' })).toEqual(['wordops: kind sponge is not "wordops"']);
  });

  it('rejects stepCount NaN instead of accepting every step', () => {
    expect(validateWordopsFacet(validFacet(), Number.NaN)).toEqual(['wordops: stepCount NaN is not a non-negative integer']);
  });

  it('rejects a transfer source with both register and term', () => {
    const facet = withV2Step((step) => {
      step.registers!.transfers![1] = { to: 2, from: { register: 3, term: 'a1' } as unknown as { register: number } };
    });
    expect(validateWordopsFacet(facet)).toEqual(['wordops step 0: registers.transfers[1]: from has both register and term']);
  });
});
