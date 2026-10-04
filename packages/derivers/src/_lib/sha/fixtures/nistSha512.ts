import type { NistShaExample } from './nistSha256.ts';
import type { Sha512FixturePreset } from './shaBundles.ts';

/**
 * Test-only: NIST CSRC "Examples with Intermediate Values" (SHA512.pdf), copied here because derivers
 * may not import primitives. `vars[t]`: a … h after round t (1, 39, 79) of block 1 of "abc"; `h`: the
 * chaining values H^(1), H^(2), … as 8 words of 64 bits (the digest is their concatenation). Every
 * value was recomputed with an independent SHA-512 implementation (its digests equal Python's
 * `hashlib`).
 */
export const NIST_SHA512_ABC: NistShaExample = {
  vars: {
    1: [
      '1320f8c9fb872cc0',
      'f6afceb8bcfcddf5',
      '6a09e667f3bcc908',
      'bb67ae8584caa73b',
      'c3d4ebfd48650ffa',
      '58cb02347ab51f91',
      '510e527fade682d1',
      '9b05688c2b3e6c1f',
    ],
    39: [
      '8e01e125b855d225',
      'b3bb8542b3376de5',
      '002bb8e4cd989567',
      '88df85b0bbe77514',
      '0c710a47ba6a567b',
      'b49596c20feba7de',
      '66adcfa249ac7bbd',
      '8fbfd0162bbf4675',
    ],
    79: [
      '73a54f399fa4b1b2',
      '10d9c4c4295599f6',
      'd67806db8b148677',
      '654ef9abec389ca9',
      'd08446aa79693ed7',
      '9bb4d39778c07f9e',
      '25c96a7768fb2aa3',
      'ceb9fc3691ce8326',
    ],
  },
  h: [
    [
      'ddaf35a193617aba',
      'cc417349ae204131',
      '12e6fa4e89a97ea2',
      '0a9eeee64b55d39a',
      '2192992a274fc1a8',
      '36ba3c23a3feebbd',
      '454d4423643ce80e',
      '2a9ac94fa54ca49f',
    ],
  ],
  digest:
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
};

/** The 112-byte message "abcdefghbcdefghi…nopqrstu" (two blocks). */
export const NIST_SHA512_TWO_BLOCK: NistShaExample = {
  vars: {},
  h: [
    [
      '4319017a2b706e69',
      'cd4b05938bae5e89',
      '0186bf199f30aa95',
      '6ef8b71d2f810585',
      'd787d6764b20bda2',
      'a260144709736920',
      '00ec057f37d14b8e',
      '06add5b50e671c72',
    ],
    [
      '8e959b75dae313da',
      '8cf4f72814fc143f',
      '8f7779c6eb9f7fa1',
      '7299aeadb6889018',
      '501d289e4900f7e4',
      '331b99dec4b5433a',
      'c7d329eeb6dd2654',
      '5e96e55b874be909',
    ],
  ],
  digest:
    '8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa17299aeadb6889018501d289e4900f7e4331b99dec4b5433ac7d329eeb6dd26545e96e55b874be909',
};

export const NIST_SHA512_BY_PRESET: Readonly<Record<Sha512FixturePreset, NistShaExample>> = {
  'sha-512-abc': NIST_SHA512_ABC,
  'sha-512-two-block': NIST_SHA512_TWO_BLOCK,
};
