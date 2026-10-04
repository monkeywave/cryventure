import { KECCAK_STATE_BYTES } from './constants.ts';
import type { KeccakAlgorithmId } from './manifestKit.ts';
import { DOMAIN_SUFFIXES, type DomainSuffix, type KeccakDomain } from './padding.ts';

/**
 * The nine sponge functions on Keccak-f[1600] (FIPS 202 §6, SP 800-185 §3, and the original Keccak
 * padding as Ethereum uses it): rate r = 1600 − c, capacity c = 2 × the security strength.
 */
export interface KeccakAlgorithm {
  id: KeccakAlgorithmId;
  /** Display name, e.g. `SHA3-256`. */
  name: string;
  domain: KeccakDomain;
  /** Rate r in bytes, e.g. 136. */
  rateBytes: number;
  /** Capacity c in bits. */
  capacityBits: number;
  /** Security strength in bits (c / 2). */
  securityBits: number;
  /** Digest size d in bytes for the fixed-length functions; undefined for an XOF. */
  outputSize?: number;
}

export const KECCAK_STATE_BITS = KECCAK_STATE_BYTES * 8;

function algorithm(id: KeccakAlgorithmId, name: string, domain: KeccakDomain, securityBits: number, outputSize?: number): KeccakAlgorithm {
  const capacityBits = 2 * securityBits;
  return { id, name, domain, rateBytes: (KECCAK_STATE_BITS - capacityBits) / 8, capacityBits, securityBits, ...(outputSize === undefined ? {} : { outputSize }) };
}

/** SHA3-d: c = 2d (FIPS 202 §6.1); SHAKE128/256: c = 256/512 (§6.2); cSHAKE as SHAKE (SP 800-185 §3.3); Keccak-256: c = 512. */
export const KECCAK_ALGORITHMS: Readonly<Record<KeccakAlgorithmId, KeccakAlgorithm>> = {
  'sha3-224': algorithm('sha3-224', 'SHA3-224', 'sha3', 224, 28),
  'sha3-256': algorithm('sha3-256', 'SHA3-256', 'sha3', 256, 32),
  'sha3-384': algorithm('sha3-384', 'SHA3-384', 'sha3', 384, 48),
  'sha3-512': algorithm('sha3-512', 'SHA3-512', 'sha3', 512, 64),
  'keccak-256': algorithm('keccak-256', 'Keccak-256', 'keccak', 256, 32),
  shake128: algorithm('shake128', 'SHAKE128', 'shake', 128),
  shake256: algorithm('shake256', 'SHAKE256', 'shake', 256),
  cshake128: algorithm('cshake128', 'cSHAKE128', 'cshake', 128),
  cshake256: algorithm('cshake256', 'cSHAKE256', 'cshake', 256),
};

/** Whether `algorithm` is an extendable-output function (no fixed digest size). */
export function isXof(algorithm: KeccakAlgorithm): boolean {
  return algorithm.outputSize === undefined;
}

/** Whether `algorithm` takes N and S (cSHAKE). */
export function isCustomizable(algorithm: KeccakAlgorithm): boolean {
  return algorithm.domain === 'cshake';
}

/**
 * The suffix actually appended: cSHAKE with N and S both empty is SHAKE (SP 800-185 §3.3), so it
 * pads with SHAKE's `1111` and has no prefix.
 */
export function effectiveDomain(algorithm: KeccakAlgorithm, customized: boolean): KeccakDomain {
  return algorithm.domain === 'cshake' && !customized ? 'shake' : algorithm.domain;
}

export function domainSuffix(domain: KeccakDomain): DomainSuffix {
  return DOMAIN_SUFFIXES[domain];
}
