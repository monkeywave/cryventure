import { definePrimitive, type PortMemberDecl, type Preset } from '@cryventure/core';
import { KMAC_MAC_IDS, kmacOps, kmacParamFields, validateKmacParams, type KmacAlgorithmId, type KmacOutputLength, type KmacParams } from '../_lib/keccak/manifestKit.ts';

/**
 * Manifest for KMAC128/256 and KMACXOF128/256 (SP 800-185 §4; docs/M7.md §2c): cSHAKE with N = "KMAC"
 * over bytepad(encode_string(K), r) ‖ X ‖ right_encode(L), traced on the sha3 sponge recording. Imports
 * core and the core-only `_lib/keccak/manifestKit.ts`; the sponge and the recorder load lazily.
 */
export type { KmacParams } from '../_lib/keccak/manifestKit.ts';

const NS = 'plugin.kmac';

/** The SP 800-185 sample key 40 41 … 5f (32 bytes) and messages 00 01 02 03 and 00 … c7 (200 bytes). */
const SAMPLE_KEY = Array.from({ length: 32 }, (_, index) => (0x40 + index).toString(16)).join('');
const SHORT_X = '00010203';
const LONG_X = Array.from({ length: 200 }, (_, index) => index.toString(16).padStart(2, '0')).join('');
const TAGGED = 'My Tagged Application';

function preset(id: string, algorithm: KmacAlgorithmId, input: string, customization: string, outputLength: KmacOutputLength): Preset<KmacParams> {
  return { id, labelKey: `${NS}.preset.${id}`, params: { algorithm, key: SAMPLE_KEY, encoding: 'hex', input, customization, outputLength, detail: 'permutation' } };
}

export const KMAC_PRESETS: Preset<KmacParams>[] = [
  preset('kmac128-sample1', 'kmac128', SHORT_X, '', '32'),
  preset('kmac128-sample2', 'kmac128', SHORT_X, TAGGED, '32'),
  preset('kmac128-sample3', 'kmac128', LONG_X, TAGGED, '32'),
  preset('kmac256-sample4', 'kmac256', SHORT_X, TAGGED, '64'),
  preset('kmac256-sample5', 'kmac256', LONG_X, '', '64'),
  preset('kmac256-sample6', 'kmac256', LONG_X, TAGGED, '64'),
  preset('kmacxof128-sample1', 'kmacxof128', SHORT_X, '', '32'),
  preset('kmacxof256-sample4', 'kmacxof256', SHORT_X, TAGGED, '64'),
];

/** The `Mac` members kmac128, kmac256. */
export const KMAC_PORT_MEMBERS: PortMemberDecl[] = KMAC_MAC_IDS.map((id) => ({ id, labelKey: `${NS}.mac.${id}`, construction: 'kmac' }));

export const kmacManifest = definePrimitive<KmacParams>({
  kind: 'primitive',
  id: 'kmac',
  apiVersion: 1,
  family: 'mac',
  implements: ['Mac'],
  titleKey: `${NS}.title`,
  refs: [
    'NIST SP 800-185 §2.3 (left_encode, right_encode, encode_string, bytepad), §3 (cSHAKE), §4 (KMAC, KMACXOF)',
    'NIST FIPS 202 §3 (Keccak-p), §4 (sponge construction), §5 (pad10*1)',
    'NIST CSRC, Examples with Intermediate Values: KMAC_samples.pdf, KMACXOF_samples.pdf',
  ],
  facets: ['state', 'values', 'narration', 'sponge'],
  presets: KMAC_PRESETS,
  defaults: { ...KMAC_PRESETS[0]!.params },
  i18nNamespace: NS,
  portMembers: { Mac: KMAC_PORT_MEMBERS },
  paramFields: kmacParamFields(NS),
  ops: kmacOps(NS),
  outputs: { tag: { labelKey: `${NS}.output.tag` } },
  validate: (params) => validateKmacParams(NS, params),
  load: () => import('./module.ts'),
});

export default kmacManifest;
