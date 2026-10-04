import { facetKey, narrationFromState, parseHexOrThrow, requirePortMember, type PrimitiveManifest, type ProducerLookup, type RunOptions, type RunResult, type TraceBundle } from '@cryventure/core';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { primitiveManifests } from '../index.ts';
import { hashZoom } from './hashZoom.ts';
import { computeHmac, resolveTagLength } from './hmacCompute.ts';
import { hmacDerivation, hmacMath, hmacValues } from './hmacFacets.ts';
import { recordHmac } from './hmacTrace.ts';
import { hmacManifest, type HmacParams } from './manifest.ts';

/**
 * The HMAC lab (docs/M7.md §2b): HMAC(K, m) = H((K0 ⊕ opad) ‖ H((K0 ⊕ ipad) ‖ m)) over the `Hash`
 * member named by `hash`, with truncation and a constant-time verify step.
 *
 * Zoom links: `run` cannot reach other manifests through `resolve` (it yields ports only), so the
 * hash producer's `hashLabParams` is looked up in this package's manifest registry (the package API,
 * not another plugin's internals; manifests import core only, so this adds no cycle at load time).
 */
const registeredProducers: ProducerLookup = new Map<string, PrimitiveManifest>(primitiveManifests.map((manifest) => [manifest.id, manifest]));

/** Validates `params`, resolves the hash member, records HMAC and returns a TraceBundle (run errors: hash missing, tag length). */
export function run(params: HmacParams, options: RunOptions = {}): RunResult {
  const validated = hmacManifest.validate(params);
  if (!validated.ok) return validated;
  const value = validated.value;
  const member = requirePortMember(options.resolve, 'Hash', value.hash);
  if (!member.ok) return member;
  const tagLength = resolveTagLength(value.tagLength, member.member);
  if (!tagLength.ok) return tagLength;
  const expected = value.expected === '' ? undefined : Array.from(parseHexOrThrow(value.expected));
  const message = Uint8Array.from(hashMessageBytes(value.encoding, value.input));
  const computation = computeHmac(member.member, parseHexOrThrow(value.key), message, tagLength.bytes, expected === undefined ? undefined : Uint8Array.from(expected));
  const { state, steps } = recordHmac(computation, expected);
  const zoom = (data: readonly number[]) => hashZoom(registeredProducers, member.producerId, member.memberId, data);
  const output: Record<string, number[]> = { tag: computation.tag };
  if (computation.comparison !== undefined) output['verified'] = [computation.comparison.equal ? 1 : 0];
  const trace: TraceBundle = {
    schemaVersion: 1,
    producer: { kind: 'primitive', id: hmacManifest.id, apiVersion: hmacManifest.apiVersion },
    provenance: 'modeled',
    params: value,
    facets: {
      [facetKey('state')]: state,
      [facetKey('values')]: hmacValues(computation, steps, expected),
      [facetKey('narration')]: narrationFromState(state),
      [facetKey('derivation')]: hmacDerivation(computation, steps, zoom),
      [facetKey('math')]: hmacMath(computation, steps),
    },
    output,
  };
  return { ok: true, trace };
}
