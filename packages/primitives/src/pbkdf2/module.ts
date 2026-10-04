import { narrationFromState, type MacFunction, type PrimitiveRecording, type RunOptions, type RunResult } from '@cryventure/core';
import { hashMessageBytes } from '../_lib/hashKit/manifestKit.ts';
import { requireHmacMembers } from '../_lib/hmac/requireHmacMember.ts';
import { runPrimitiveChecked } from '../_lib/runChecked.ts';
import { pbkdf2Derivation, pbkdf2Values } from './facets.ts';
import { pbkdf2Manifest, type Pbkdf2Params } from './manifest.ts';
import { recordPbkdf2, type Pbkdf2Input } from './record.ts';

/** PBKDF2 producer (RFC 8018 §5.2): DK = T₁ ‖ … ‖ T_l, T_i = U₁ ⊕ … ⊕ U_c, PRF = the HMAC member `mac`. */
const NS = 'plugin.pbkdf2';

function toInput(value: Pbkdf2Params, mac: MacFunction): Pbkdf2Input {
  return {
    mac,
    password: hashMessageBytes(value.passwordEncoding, value.password),
    salt: hashMessageBytes(value.saltEncoding, value.salt),
    iterations: Number(value.iterations),
    length: Number(value.length),
  };
}

function record(value: Pbkdf2Params, mac: MacFunction): PrimitiveRecording {
  const input = toInput(value, mac);
  const recording = recordPbkdf2(input);
  return {
    facets: {
      state: recording.state,
      values: pbkdf2Values(recording, input),
      derivation: pbkdf2Derivation(recording, input),
      narration: narrationFromState(recording.state),
    },
    output: { dk: recording.dk },
  };
}

/** Validates `params`, resolves the HMAC member, records PBKDF2 and returns a TraceBundle (run errors: missing or non-HMAC member). */
export function run(params: Pbkdf2Params, options: RunOptions = {}): RunResult {
  return runPrimitiveChecked(pbkdf2Manifest, params, (value) => requireHmacMembers(options.resolve, [value.mac], NS), (value, [mac]) => record(value, mac));
}
