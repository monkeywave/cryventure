import type { AesFixturePreset } from './aesBundles.ts';

/**
 * Test-only: FIPS 197 App. C intermediate values (`round[r].start` for r = 1…Nr, `round[r].m_col`
 * for r = 1…Nr−1, and the output), hex in memory order. Copied from the standard and cross-checked
 * with an independent implementation.
 */
export interface AppendixCVector {
  rounds: number;
  start: string[];
  mixColumns: string[];
  ciphertext: string;
}

export const FIPS197_APPENDIX_C: Record<AesFixturePreset, AppendixCVector> = {
  'fips197-c1': {
    rounds: 10,
    start: [
      '00102030405060708090a0b0c0d0e0f0',
      '89d810e8855ace682d1843d8cb128fe4',
      '4915598f55e5d7a0daca94fa1f0a63f7',
      'fa636a2825b339c940668a3157244d17',
      '247240236966b3fa6ed2753288425b6c',
      'c81677bc9b7ac93b25027992b0261996',
      'c62fe109f75eedc3cc79395d84f9cf5d',
      'd1876c0f79c4300ab45594add66ff41f',
      'fde3bad205e5d0d73547964ef1fe37f1',
      'bd6e7c3df2b5779e0b61216e8b10b689',
    ],
    mixColumns: [
      '5f72641557f5bc92f7be3b291db9f91a',
      'ff87968431d86a51645151fa773ad009',
      '4c9c1e66f771f0762c3f868e534df256',
      '6385b79ffc538df997be478e7547d691',
      'f4bcd45432e554d075f1d6c51dd03b3c',
      '9816ee7400f87f556b2c049c8e5ad036',
      'c57e1c159a9bd286f05f4be098c63439',
      'baa03de7a1f9b56ed5512cba5f414d23',
      'e9f74eec023020f61bf2ccf2353c21c7',
    ],
    ciphertext: '69c4e0d86a7b0430d8cdb78070b4c55a',
  },
  'fips197-c2': {
    rounds: 12,
    start: [
      '00102030405060708090a0b0c0d0e0f0',
      '4f63760643e0aa85aff8c9d041fa0de4',
      'cb02818c17d2af9c62aa64428bb25fd7',
      'f75c7778a327c8ed8cfebfc1a6c37f53',
      '22ffc916a81474416496f19c64ae2532',
      '80121e0776fd1d8a8d8c31bc965d1fee',
      '671ef1fd4e2a1e03dfdcb1ef3d789b30',
      '0c0370d00c01e622166b8accd6db3a2c',
      '7255dad30fb80310e00d6c6b40d0527c',
      'a906b254968af4e9b4bdb2d2f0c44336',
      '88ec930ef5e7e4b6cc32f4c906d29414',
      'afb73eeb1cd1b85162280f27fb20d585',
    ],
    mixColumns: [
      '5f72641557f5bc92f7be3b291db9f91a',
      '9f487f794f955f662afc86abd7f1ab29',
      'b7a53ecbbf9d75a0c40efc79b674cc11',
      '7a1e98bdacb6d1141a6944dd06eb2d3e',
      'aaa755b34cffe57cef6f98e1f01c13e6',
      '921f748fd96e937d622d7725ba8ba50c',
      'e913e7b18f507d4b227ef652758acbcc',
      '6cf5edf996eb0a069c4ef21cbfc25762',
      '7478bcdce8a50b81d4327a9009188262',
      '0d73cc2d8f6abe8b0cf2dd9bb83d422e',
      '71d720933b6d677dc00b8f28238e0fb7',
    ],
    ciphertext: 'dda97ca4864cdfe06eaf70a0ec0d7191',
  },
  'fips197-c3': {
    rounds: 14,
    start: [
      '00102030405060708090a0b0c0d0e0f0',
      '4f63760643e0aa85efa7213201a4e705',
      '1859fbc28a1c00a078ed8aadc42f6109',
      '975c66c1cb9f3fa8a93a28df8ee10f63',
      '1c05f271a417e04ff921c5c104701554',
      'c357aae11b45b7b0a2c7bd28a8dc99fa',
      '7f074143cb4e243ec10c815d8375d54c',
      'd653a4696ca0bc0f5acaab5db96c5e7d',
      '5aa858395fd28d7d05e1a38868f3b9c5',
      '4a824851c57e7e47643de50c2af3e8c9',
      'c14907f6ca3b3aa070e9aa313b52b5ec',
      '5f9c6abfbac634aa50409fa766677653',
      '516604954353950314fb86e401922521',
      '627bceb9999d5aaac945ecf423f56da5',
    ],
    mixColumns: [
      '5f72641557f5bc92f7be3b291db9f91a',
      'bd2a395d2b6ac438d192443e615da195',
      '810dce0cc9db8172b3678c1e88a1b5bd',
      'b2822d81abe6fb275faf103a078c0033',
      'aeb65ba974e0f822d73f567bdb64c877',
      'b951c33c02e9bd29ae25cdb1efa08cc7',
      'ebb19e1c3ee7c9e87d7535e9ed6b9144',
      '5174c8669da98435a8b3e62ca974a5ea',
      '0f77ee31d2ccadc05430a83f4ef96ac3',
      'bd86f0ea748fc4f4630f11c1e9331233',
      'af8690415d6e1dd387e5fbedd5c89013',
      '7427fae4d8a695269ce83d315be0392b',
      '2c21a820306f154ab712c75eee0da04f',
    ],
    ciphertext: '8ea2b7ca516745bfeafc49904b496089',
  },
};

/** Lowercase hex of `bytes`, for comparing against the vectors. */
export function toHex(bytes: readonly number[] | undefined): string {
  return (bytes ?? []).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
