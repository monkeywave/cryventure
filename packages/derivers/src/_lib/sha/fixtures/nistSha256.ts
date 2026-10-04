import type { ShaFixturePreset } from './shaBundles.ts';

/**
 * Test-only: NIST CSRC "Examples with Intermediate Values" (SHA256.pdf, SHA224.pdf), copied here
 * because derivers may not import primitives. `vars[t]`: a … h after round t (1, 3, 15, 63) of block 1 of "abc";
 * `h`: the chaining values H^(1), H^(2), … as 8 words (the digest is their leftmost bytes; SHA-224's
 * H_7, which its digest drops, is IV_7 + h after round 63 = befa4fa4 + 13dfb889).
 */
export interface NistShaExample {
  vars: Readonly<Record<number, readonly string[]>>;
  h: readonly (readonly string[])[];
  digest: string;
}

export const NIST_SHA256_ABC: NistShaExample = {
  vars: {
    1: [
      '5a6ad9ad',
      '5d6aebcd',
      '6a09e667',
      'bb67ae85',
      '78ce7989',
      'fa2a4622',
      '510e527f',
      '9b05688c',
    ],
    3: [
      'd550f666',
      'c8c347a7',
      '5a6ad9ad',
      '5d6aebcd',
      '24e00850',
      'f92939eb',
      '78ce7989',
      'fa2a4622',
    ],
    15: [
      'b0fa238e',
      'c0645fde',
      'd932eb16',
      '87912990',
      '07590dcd',
      '0b92f20c',
      '745a48de',
      '1e578218',
    ],
    63: [
      '506e3058',
      'd39a2165',
      '04d24d6c',
      'b85e2ce9',
      '5ef50f24',
      'fb121210',
      '948d25b6',
      '961f4894',
    ],
  },
  h: [
    [
      'ba7816bf',
      '8f01cfea',
      '414140de',
      '5dae2223',
      'b00361a3',
      '96177a9c',
      'b410ff61',
      'f20015ad',
    ],
  ],
  digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
};

export const NIST_SHA224_ABC: NistShaExample = {
  vars: {
    1: [
      'c20dab6b',
      '0e96b2da',
      'c1059ed8',
      '367cd507',
      '9cab416f',
      '0434225e',
      'ffc00b31',
      '68581511',
    ],
    3: [
      '8253cc1a',
      'ab113b7a',
      'c20dab6b',
      '0e96b2da',
      '8346b27d',
      '82177fe8',
      '9cab416f',
      '0434225e',
    ],
    15: [
      '9f341a45',
      '1d80d178',
      'be316902',
      'fc4f023e',
      '6a61c411',
      '4545f53a',
      '65141125',
      '87bea51a',
    ],
    63: [
      '6203de4a',
      'fd89031b',
      '55d1c760',
      'c693fc7a',
      '2aedb1b3',
      '55489ee6',
      '7e730e00',
      '13dfb889',
    ],
  },
  h: [
    [
      '23097d22',
      '3405d822',
      '8642a477',
      'bda255b3',
      '2aadbce4',
      'bda0b3f7',
      'e36c9da7',
      'd2da082d',
    ],
  ],
  digest: '23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7',
};

/** "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" (SHA-256, two blocks). */
export const NIST_SHA256_TWO_BLOCK: NistShaExample = {
  vars: {},
  h: [
    [
      '85e655d6',
      '417a1795',
      '3363376a',
      '624cde5c',
      '76e09589',
      'cac5f811',
      'cc4b32c1',
      'f20e533a',
    ],
    [
      '248d6a61',
      'd20638b8',
      'e5c02693',
      '0c3e6039',
      'a33ce459',
      '64ff2167',
      'f6ecedd4',
      '19db06c1',
    ],
  ],
  digest: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
};

/**
 * Not a NIST example: the 128-byte preset `sha-256-three-block` (two full blocks plus a padding-only
 * third block). H^(1) … H^(3) from an independent SHA-256 implementation; the digest cross-checked
 * with Node.js `crypto.createHash('sha256')`. No round values (`vars`) are pinned for it.
 */
export const SHA256_THREE_BLOCK: NistShaExample = {
  vars: {},
  h: [
    [
      'c8a22d42',
      'f50210bd',
      'ab320e7a',
      '50c0cec8',
      'f72b4a2b',
      'e7bdb6ca',
      'd8f67b6f',
      'b761e0c8',
    ],
    [
      '50572807',
      '23cbfb9d',
      '02806a00',
      '7c6a3d3e',
      '65de52b2',
      '94c65f1c',
      '26dc7887',
      '744d11b0',
    ],
    [
      '4d2de274',
      '0db3da98',
      '54d628c4',
      '96ff1c41',
      'ff201308',
      '562e81a3',
      'a4976fbc',
      '6dadd40e',
    ],
  ],
  digest: '4d2de2740db3da9854d628c496ff1c41ff201308562e81a3a4976fbc6dadd40e',
};

/** The NIST (or, for the three-block message, recomputed) example of each SHA fixture preset. */
export const NIST_BY_PRESET: Readonly<Record<ShaFixturePreset, NistShaExample>> = {
  'sha-256-abc': NIST_SHA256_ABC,
  'sha-256-two-block': NIST_SHA256_TWO_BLOCK,
  'sha-256-three-block': SHA256_THREE_BLOCK,
  'sha-224-abc': NIST_SHA224_ABC,
};
