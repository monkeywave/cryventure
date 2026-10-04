import {
  i18nRef,
  narrationFromState,
  parseHexToArray,
  requirePortMember,
  runPrimitive,
  utf8Bytes,
  type I18nRef,
  type MacFunction,
  type RunOptions,
  type RunResult,
} from '@cryventure/core';
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
  const info =
    params.infoEncoding === 'hex'
      ? parseHexToArray(params.info)
      : Array.from(utf8Bytes(params.info));
  return {
    mode: params.mode,
    mac,
    ikm: parseHexToArray(params.ikm),
    salt: parseHexToArray(params.salt),
    prk: parseHexToArray(params.prk),
    info,
    length: Number(params.length),
    label: params.label,
    context: parseHexToArray(params.context),
  };
}

/** Run errors that depend on HashLen: HKDF needs an HMAC; Expand needs PRK ≥ HashLen and L ≤ 255 · HashLen (RFC 5869 §2.3). */
export function runError(run: HkdfRun): I18nRef | undefined {
  const hashLen = run.mac.outputSize;
  if (run.mac.construction.kind !== 'hmac')
    return i18nRef(`${NS}.error.notHmac`, { id: run.mac.id });
  if (!extracts(run.mode) && run.prk.length < hashLen)
    return i18nRef(`${NS}.error.prkTooShort`, { length: run.prk.length, hashLen });
  if (expands(run.mode) && run.length > maxOutputLength(hashLen))
    return i18nRef(`${NS}.error.lengthTooLong`, { max: maxOutputLength(hashLen) });
  return undefined;
}

/** The traced PRK and OKM must equal the untraced RFC 5869 functions. */
function assertMatchesReference(run: HkdfRun, recording: HkdfRecording): void {
  const same = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((byte, index) => byte === b[index]);
  if (extracts(run.mode) && !same(recording.prk, hkdfExtract(run.mac, run.salt, run.ikm)))
    throw new Error('hkdf: traced PRK differs from the reference');
  if (
    expands(run.mode) &&
    !same(recording.okm, hkdfExpand(run.mac, recording.prk, recording.info, run.length))
  )
    throw new Error('hkdf: traced OKM differs from the reference');
}

/** Validates `params`, resolves the HMAC, records HKDF (checked against the untraced functions) and returns a TraceBundle. */
export function run(params: HkdfParams, options: RunOptions = {}): RunResult {
  const validated = hkdfManifest.validate(params);
  if (!validated.ok) return validated;
  const resolved = requirePortMember(options.resolve, 'Mac', validated.value.mac);
  if (!resolved.ok) return resolved;
  const hkdfRun = toRun(validated.value, resolved.member);
  const error = runError(hkdfRun);
  if (error !== undefined) return { ok: false, error };
  return runPrimitive(hkdfManifest, validated.value, () => {
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
  });
}
