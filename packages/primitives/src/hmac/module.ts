import {
  narrationFromState,
  parseHexOrThrow,
  parseHexToArray,
  requirePortMember,
  type PortResolver,
  type PrimitiveManifest,
  type PrimitiveRecording,
  type ProducerLookup,
  type RequirePortMemberResult,
  type RunOptions,
  type RunResult,
  type ValidationResult,
} from '@cryventure/core';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { runPrimitiveChecked } from '../_lib/runChecked.ts';
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
/** The resolved `Hash` member with its producer and member ids. */
type HashMember = Extract<RequirePortMemberResult<'Hash'>, { ok: true }>;

const registeredProducers: ProducerLookup = new Map<string, PrimitiveManifest>(primitiveManifests.map((manifest) => [manifest.id, manifest]));

/** The hash member `hash` names and the tag length in bytes it allows (run errors: hash missing, tag length). */
function resolveHash(resolve: PortResolver | undefined, value: HmacParams): ValidationResult<{ member: HashMember; tagBytes: number }> {
  const member = requirePortMember(resolve, 'Hash', value.hash);
  if (!member.ok) return member;
  const tagLength = resolveTagLength(value.tagLength, member.member);
  return tagLength.ok ? { ok: true, value: { member, tagBytes: tagLength.bytes } } : tagLength;
}

function record(value: HmacParams, { member, tagBytes }: { member: HashMember; tagBytes: number }): PrimitiveRecording {
  const expected = value.expected === '' ? undefined : parseHexToArray(value.expected);
  const message = Uint8Array.from(hashMessageBytes(value.encoding, value.input));
  const computation = computeHmac(member.member, parseHexOrThrow(value.key), message, tagBytes, expected === undefined ? undefined : Uint8Array.from(expected));
  const { state, steps } = recordHmac(computation, expected);
  const zoom = (data: readonly number[]) => hashZoom(registeredProducers, member.producerId, member.memberId, data);
  return {
    facets: {
      state,
      values: hmacValues(computation, steps, expected),
      narration: narrationFromState(state),
      derivation: hmacDerivation(computation, steps, zoom),
      math: hmacMath(computation, steps),
    },
    output: { tag: computation.tag, ...(computation.comparison === undefined ? {} : { verified: [computation.comparison.equal ? 1 : 0] }) },
  };
}

/** Validates `params`, resolves the hash member, records HMAC and returns a TraceBundle (run errors: hash missing, tag length). */
export function run(params: HmacParams, options: RunOptions = {}): RunResult {
  return runPrimitiveChecked(hmacManifest, params, (value) => resolveHash(options.resolve, value), record);
}
