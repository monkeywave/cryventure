import {
  bytesEqual,
  i18nRef,
  narrationFromState,
  parseHexToArray,
  runPrimitive,
  type I18nRef,
  type MacFunction,
  type PrimitiveRecording,
  type RunOptions,
  type RunResult,
} from '@cryventure/core';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { requireHmacMember } from '../_lib/hmac/requireHmacMember.ts';
import { hkdfExpand, hkdfExtract, maxOutputLength } from './hkdf.ts';
import { hkdfDerivation, hkdfValues } from './hkdfFacets.ts';
import { expands, extracts, recordHkdf, type HkdfRecording, type HkdfRun } from './hkdfTrace.ts';
import { hkdfManifest, type HkdfParams } from './manifest.ts';

/**
 * HKDF producer (RFC 5869; TLS 1.3 HKDF-Expand-Label, RFC 8446 §7.1) over the HMAC named by `mac`
 * (`Mac` port member): state, values, narration and derivation facets, outputs `{ prk?, okm? }`.
 */
const NS = 'plugin.hkdf';

/** The decoded run, with validated params (hex already normalised). */
export function toRun(params: HkdfParams, mac: MacFunction): HkdfRun {
  return {
    mode: params.mode,
    mac,
    ikm: parseHexToArray(params.ikm),
    salt: parseHexToArray(params.salt),
    prk: parseHexToArray(params.prk),
    info: hashMessageBytes(params.infoEncoding, params.info),
    length: Number(params.length),
    label: params.label,
    context: parseHexToArray(params.context),
  };
}

/**
 * Run errors that depend on HashLen (the member is an HMAC, `requireHmacMember`): Expand needs
 * PRK ≥ HashLen and L ≤ 255 · HashLen (RFC 5869 §2.3). `lengthTooLong` is a guard only: L ≤ 255
 * (`HKDF_LIMITS.length`) never exceeds 255 · HashLen for a real HMAC.
 */
export function runError(run: HkdfRun): I18nRef | undefined {
  const hashLen = run.mac.outputSize;
  if (!extracts(run.mode) && run.prk.length < hashLen)
    return i18nRef(`${NS}.error.prkTooShort`, { length: run.prk.length, hashLen });
  if (expands(run.mode) && run.length > maxOutputLength(hashLen))
    return i18nRef(`${NS}.error.lengthTooLong`, { max: maxOutputLength(hashLen) });
  return undefined;
}

/** The traced PRK and OKM must equal the untraced RFC 5869 functions. */
function assertMatchesReference(run: HkdfRun, recording: HkdfRecording): void {
  if (extracts(run.mode) && !bytesEqual(recording.prk, hkdfExtract(run.mac, run.salt, run.ikm)))
    throw new Error('hkdf: traced PRK differs from the reference');
  if (
    expands(run.mode) &&
    !bytesEqual(recording.okm, hkdfExpand(run.mac, recording.prk, recording.info, run.length))
  )
    throw new Error('hkdf: traced OKM differs from the reference');
}

type RunFailure = Extract<RunResult, { ok: false }>;

/** Resolves the HMAC of validated params and decodes the run, or the run error (missing member, HashLen limits). */
function prepareRun(params: HkdfParams, options: RunOptions): { ok: true; run: HkdfRun } | RunFailure {
  const resolved = requireHmacMember(options.resolve, params.mac, NS);
  if (!resolved.ok) return resolved;
  const hkdfRun = toRun(params, resolved.mac);
  const error = runError(hkdfRun);
  return error === undefined ? { ok: true, run: hkdfRun } : { ok: false, error };
}

/** Records HKDF (checked against the untraced functions) into facets and outputs. */
function recordBundle(hkdfRun: HkdfRun): PrimitiveRecording {
  const recording = recordHkdf(hkdfRun);
  assertMatchesReference(hkdfRun, recording);
  return {
    facets: {
      state: recording.state,
      values: hkdfValues(hkdfRun, recording),
      narration: narrationFromState(recording.state),
      derivation: hkdfDerivation(hkdfRun, recording),
    },
    output: {
      ...(extracts(hkdfRun.mode) ? { prk: recording.prk } : {}),
      ...(expands(hkdfRun.mode) ? { okm: recording.okm } : {}),
    },
  };
}

const NO_RECORDING: PrimitiveRecording = { facets: {}, output: {} };

/**
 * Validates `params` once (`runPrimitive`), then resolves the HMAC and records HKDF inside its
 * callback; a run error replaces the bundle.
 */
export function run(params: HkdfParams, options: RunOptions = {}): RunResult {
  let failure: RunFailure | undefined;
  const result = runPrimitive(hkdfManifest, params, (validated) => {
    const prepared = prepareRun(validated, options);
    if (prepared.ok) return recordBundle(prepared.run);
    failure = prepared;
    return NO_RECORDING;
  });
  return failure ?? result;
}
