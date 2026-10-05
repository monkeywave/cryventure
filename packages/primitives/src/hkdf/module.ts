import {
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
import { hkdfDerivation, hkdfValues } from './hkdfFacets.ts';
import { expands, extracts, recordHkdf, type HkdfRun } from './hkdfTrace.ts';
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
 * The run error that depends on HashLen (the member is an HMAC, `requireHmacMember`): Expand needs
 * PRK ≥ HashLen (RFC 5869 §2.3). L ≤ 255 (`HKDF_LIMITS.length`) never exceeds 255 · HashLen for a real HMAC.
 */
export function runError(run: HkdfRun): I18nRef | undefined {
  const hashLen = run.mac.outputSize;
  if (!extracts(run.mode) && run.prk.length < hashLen)
    return i18nRef(`${NS}.error.prkTooShort`, { length: run.prk.length, hashLen });
  return undefined;
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

/** Records HKDF into facets and outputs. */
function recordBundle(hkdfRun: HkdfRun): PrimitiveRecording {
  const recording = recordHkdf(hkdfRun);
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
