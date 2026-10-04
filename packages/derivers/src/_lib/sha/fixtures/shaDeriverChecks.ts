import type { DeriverManifest } from '@cryventure/core';
import { aesFixtureBundle } from '../../fixtures/aesBundles.ts';
import { shaFixtureBundle } from './shaBundles.ts';

/** Test-only: the catalog and manifest checks both SHA ISA derivers share (docs/M5.md §5a). */

/** What both SHA ISA deriver manifests declare besides their id. */
export const SHA_DERIVER_CONTRACT = {
  kind: 'deriver',
  apiVersion: 1,
  from: ['state', 'values', 'wordops'],
  provides: ['instructions', 'registers'],
} as const;

const params = (text: string | undefined): string[] =>
  [...(text ?? '').matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!).sort();

/** Keys only one language has, keys outside `deriver.<id>.*`, and keys whose `{{params}}` differ. */
export function catalogProblems(
  id: string,
  en: Readonly<Record<string, string>>,
  de: Readonly<Record<string, string>>,
): string[] {
  const keys = [...new Set([...Object.keys(en), ...Object.keys(de)])].sort();
  return keys.flatMap((key) => {
    if (!(key in en) || !(key in de)) return [`${key}: not in both catalogs`];
    if (!key.startsWith(`deriver.${id}.`)) return [`${key}: outside deriver.${id}.*`];
    return params(en[key]).join() === params(de[key]).join() ? [] : [`${key}: params differ`];
  });
}

/** `appliesTo` of SHA-256 "abc", SHA-224 "abc", SHA-256 "abc" at block detail and an AES bundle. */
export function shaApplicability(manifest: DeriverManifest): boolean[] {
  const block = shaFixtureBundle('sha-256-abc');
  block.params = { ...(block.params as object), detail: 'block' };
  const bundles = [
    shaFixtureBundle('sha-256-abc'),
    shaFixtureBundle('sha-224-abc'),
    block,
    aesFixtureBundle('fips197-c1'),
  ];
  return bundles.map((bundle) => manifest.appliesTo!(bundle));
}
