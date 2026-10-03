import {
  assertMatchesReference,
  checkKeyLength,
  gcmAccepts,
  gcmDecrypt,
  gcmEncrypt,
  i18nRef,
  narrationFromState,
  parseHexOrThrow,
  parseHexToArray,
  requirePort,
  runPrimitive,
  scopeLevels,
  type BlockCipher,
  type I18nRef,
  type PrimitiveRecording,
  type RunOptions,
  type RunResult,
} from '@cryventure/core';
import { gcmChain, gcmField, gcmValues, gcmWire, releasesOutput } from './gcmFacets.ts';
import { gcmCtrOutput, recordGcm, type GcmRecording, type GcmRun } from './gcmTrace.ts';
import { gcmManifest, type GcmParams } from './manifest.ts';

/** GCM producer (SP 800-38D): GCTR from inc32(J0), GHASH over AAD and ciphertext, T = MSB_t(S ⊕ E_K(J0)). */
const NS = 'plugin.gcm';
const GCM_SCOPE_LEVELS = scopeLevels(NS, 'phase', 'op');

/** Throws unless the traced outputs equal the untraced core reference (`gcmEncrypt` / `gcmDecrypt`). */
export function assertMatchesGcmReference(recording: GcmRecording): void {
  const { run } = recording;
  const [iv, aad, input] = [run.iv, run.aad, run.input].map((bytes) => Uint8Array.from(bytes)) as [Uint8Array, Uint8Array, Uint8Array];
  if (run.direction === 'encrypt') {
    const reference = gcmEncrypt(run.cipher, run.key, iv, aad, input, run.tagBytes);
    assertMatchesReference(gcmCtrOutput(recording), reference.ciphertext, 'gcm ciphertext');
    assertMatchesReference(recording.tag, reference.tag, 'gcm tag');
    return;
  }
  const reference = gcmDecrypt(run.cipher, run.key, iv, aad, input, Uint8Array.from(run.receivedTag));
  if (reference.ok !== releasesOutput(recording)) throw new Error('gcm: the traced verify result differs from the core reference');
  if (reference.ok) assertMatchesReference(gcmCtrOutput(recording), reference.plaintext, 'gcm plaintext');
}

/** encrypt: `{ ciphertext, tag }`; decrypt: `{ plaintext }` when authentic, else `{}` (no plaintext on FAIL). */
export function gcmOutputs(recording: GcmRecording): Record<string, number[]> {
  if (recording.run.direction === 'encrypt') return { ciphertext: gcmCtrOutput(recording), tag: recording.tag };
  return releasesOutput(recording) ? { plaintext: gcmCtrOutput(recording) } : {};
}

function recordBundle(run: GcmRun): PrimitiveRecording {
  const recording = recordGcm(run);
  assertMatchesGcmReference(recording);
  const facet = { ...recording.facet, scopeLevels: GCM_SCOPE_LEVELS };
  return {
    facets: {
      state: facet,
      values: gcmValues(recording),
      narration: narrationFromState(facet),
      chain: gcmChain(recording),
      wire: gcmWire(recording),
      field: gcmField(recording),
    },
    output: gcmOutputs(recording),
  };
}

type ResolvedCipher = { ok: true; cipher: BlockCipher; key: Uint8Array } | { ok: false; error: I18nRef };

/** The cipher (it must have 128-bit blocks) and the key (a size the cipher accepts), or a run error. */
export function resolveGcmCipher(options: RunOptions, params: Pick<GcmParams, 'cipher' | 'keyHex'>): ResolvedCipher {
  const port = requirePort(options.resolve, 'BlockCipher', params.cipher);
  if (!port.ok) return port;
  if (!gcmAccepts(port.port)) return { ok: false, error: i18nRef(`${NS}.error.blockSize`, { blockSize: port.port.blockSize }) };
  const key = parseHexOrThrow(params.keyHex);
  const keyError = checkKeyLength(port.port, key);
  return keyError === undefined ? { ok: true, cipher: port.port, key } : { ok: false, error: keyError };
}

/** Validates `params`, resolves the cipher, records GCM and returns a TraceBundle (run errors: missing cipher, block size, key size). */
export function run(params: GcmParams, options: RunOptions = {}): RunResult {
  const validated = gcmManifest.validate(params);
  if (!validated.ok) return validated;
  const valid = validated.value;
  const resolved = resolveGcmCipher(options, valid);
  if (!resolved.ok) return resolved;
  const gcmRun: GcmRun = {
    cipher: resolved.cipher,
    key: resolved.key,
    iv: parseHexToArray(valid.ivHex),
    aad: parseHexToArray(valid.aadHex),
    input: parseHexToArray(valid.inputHex),
    direction: valid.direction,
    tagBytes: Number(valid.tagBytes),
    receivedTag: valid.direction === 'decrypt' ? parseHexToArray(valid.tagHex) : [],
  };
  return runPrimitive(gcmManifest, valid, () => recordBundle(gcmRun));
}
