import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { encodeJsonBase64Url } from './base64url.ts';
import {
  MAX_HASH_LENGTH,
  decodeLabFields,
  encodeLabStates,
  headingAnchor,
  parseLabGroups,
  readLabLink,
  withLabState,
  withoutLab,
  type LabLinkState,
} from './deepLink.ts';

const params = { keyHex: '000102', plaintextHex: 'ff', detail: 'op' };
const p = encodeJsonBase64Url(params);

describe('parseLabGroups', () => {
  it('groups fields by the preceding lab id and ignores foreign anchors', () => {
    const groups = parseLabGroups(`#intro&lab=a&s=3&v=1&lab=b&p=${p}&v=1`);
    expect([...groups.keys()]).toEqual(['a', 'b']);
    expect(groups.get('a')?.get('s')).toBe('3');
    expect(groups.get('b')?.get('p')).toBe(p);
  });

  it('returns no groups for an unrelated hash', () => {
    expect(parseLabGroups('#some-heading').size).toBe(0);
  });

  it('survives malformed percent-escapes', () => {
    expect(parseLabGroups('lab=a&%E0%A4%A=1&v=1').get('a')?.get('v')).toBe('1');
  });
});

describe('decodeLabFields', () => {
  const fields = (entries: Record<string, string>) => new Map(Object.entries(entries));

  it('decodes params and step', () => {
    expect(decodeLabFields(fields({ p, s: '-1', v: '1' }))).toEqual({ status: 'valid', state: { params, step: -1 } });
  });

  it.each([
    ['missing version', { s: '2' }],
    ['foreign version', { s: '2', v: '2' }],
    ['non-integer step', { s: '1.5', v: '1' }],
    ['step below initial', { s: '-2', v: '1' }],
    ['bad params', { p: '%%%', v: '1' }],
  ])('marks %s as invalid', (_name, entries) => {
    expect(decodeLabFields(fields(entries))).toEqual({ status: 'invalid' });
  });
});

describe('readLabLink', () => {
  it('is absent when the lab is not in the hash', () => {
    expect(readLabLink('#lab=other&v=1', 'mine')).toEqual({ status: 'absent' });
  });

  it('rejects oversized hashes', () => {
    const hash = `lab=a&s=1&v=1&junk=${'x'.repeat(MAX_HASH_LENGTH)}`;
    expect(readLabLink(hash, 'a')).toEqual({ status: 'invalid' });
  });
});

describe('withLabState / withoutLab', () => {
  it('adds a lab while keeping the others', () => {
    const next = withLabState('lab=a&s=1&v=1', 'b', { step: 4 });
    expect(next).toBe('lab=a&s=1&v=1&lab=b&s=4&v=1');
  });

  it('replaces an existing lab in place and keeps a leading heading anchor', () => {
    expect(withLabState('intro&lab=a&s=1&v=1&lab=b&s=2&v=1', 'a', { step: 9 })).toBe('intro&lab=a&s=9&v=1&lab=b&s=2&v=1');
  });

  it('keeps a plain heading anchor first when the first lab state is written', () => {
    expect(withLabState('how-it-works', 'a', { step: 2 })).toBe('how-it-works&lab=a&s=2&v=1');
  });

  it('never stores a step without its params when they do not fit (null: the caller drops the entry)', () => {
    const huge = { blob: 'x'.repeat(MAX_HASH_LENGTH) };
    expect(withLabState('', 'a', { params: huge, step: 3 })).toBeNull();
  });

  it('removes one lab', () => {
    expect(withoutLab('lab=a&s=1&v=1&lab=b&s=2&v=1', 'a')).toBe('lab=b&s=2&v=1');
  });

  it('keeps a leading heading anchor when removing a lab', () => {
    expect(withoutLab('intro&lab=a&s=1&v=1', 'a')).toBe('intro');
  });
});

describe('headingAnchor', () => {
  it('is the leading non-lab token of a combined hash', () => {
    expect(headingAnchor('#how-it-works&lab=a&s=1&v=1')).toBe('how-it-works');
  });

  it('decodes percent-escaped heading ids', () => {
    expect(headingAnchor('#gr%C3%BC%C3%9Fe&lab=a&v=1')).toBe('grüße');
  });

  it.each([['#lab=a&s=1&v=1'], [''], ['#how-it-works'], ['#%E0%A4%A&lab=a&v=1']])('is undefined for %j (no lab state or no anchor)', (hash) => {
    expect(headingAnchor(hash)).toBeUndefined();
  });
});

describe('deep link roundtrip (property)', () => {
  const labId = fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  const state: fc.Arbitrary<LabLinkState> = fc.record(
    {
      params: fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.integer(), fc.boolean())),
      step: fc.integer({ min: -1, max: 10_000 }),
    },
    { requiredKeys: [] },
  );

  it('decodes what it encodes, for every lab on the page', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.tuple(labId, state), { selector: ([id]) => id, maxLength: 4 }), (entries) => {
        const hash = encodeLabStates(new Map(entries));
        fc.pre(hash.length < MAX_HASH_LENGTH);
        for (const [id, expected] of entries) expect(readLabLink(`#${hash}`, id)).toEqual({ status: 'valid', state: expected });
      }),
    );
  });
});
