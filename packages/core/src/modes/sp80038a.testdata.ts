/** NIST SP 800-38A Appendix F test vectors (AES-128), concatenated lowercase hex (test-only). */
export const SP800_38A = {
  key128: '2b7e151628aed2a6abf7158809cf4f3c',
  plaintext:
    '6bc1bee22e409f96e93d7e117393172a' +
    'ae2d8a571e03ac9c9eb76fac45af8e51' +
    '30c81c46a35ce411e5fbc1191a0a52ef' +
    'f69f2445df4f9b17ad2b417be66c3710',
  /** F.1.1 ECB-AES128.Encrypt */
  ecb128:
    '3ad77bb40d7a3660a89ecaf32466ef97' +
    'f5d3d58503b9699de785895a96fdbaaf' +
    '43b1cd7f598ece23881b00e3ed030688' +
    '7b0c785e27e8ad3f8223207104725dd4',
  /** F.2.1 CBC-AES128.Encrypt */
  cbcIv: '000102030405060708090a0b0c0d0e0f',
  cbc128:
    '7649abac8119b246cee98e9b12e9197d' +
    '5086cb9b507219ee95db113a917678b2' +
    '73bed6b8e3c1743b7116e69e22229516' +
    '3ff1caa1681fac09120eca307586e1a7',
  /** F.5.1 CTR-AES128.Encrypt */
  ctrCounter: 'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff',
  ctr128:
    '874d6191b620e3261bef6864990db6ce' +
    '9806f66b7970fdff8617187bb9fffdff' +
    '5ae4df3edbd5d35e5b4f09020db03eab' +
    '1e031dda2fbe03d1792170a0f3009cee',
} as const;
