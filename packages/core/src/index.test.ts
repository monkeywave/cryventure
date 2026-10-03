import { describe, expect, it } from 'vitest';
import * as core from './index.ts';

describe('public API', () => {
  it('re-exports the runtime surface', () => {
    const expected = [
      'parseHex', 'toHex', 'bytesEqual', 'xorBytes',
      'createTranslator', 'extractParams', 'interpolate', 'i18nRef',
      'supportedLocales', 'defaultLocale', 'isLocale', 'toLocale', 'parseCatalogPath', 'mergeCatalogs',
      'facetKey', 'parseFacetKey', 'getFacet', 'availableFacetKinds',
      'NullTracer', 'RecordingTracer', 'ScopeStack', 'applyWrites', 'regionSize',
      'stateAt', 'nearestKeyframe', 'valueId', 'narrationAt', 'narrationFromState', 'INITIAL_STEP_INDEX',
      'Registry', 'definePrimitive', 'defineView', 'defineDeriver', 'viewsFor', 'reachableFacetKinds',
      'inferHexFields', 'paramFieldsOf', 'paramFieldKeys', 'optionLabelKey',
      'allIndices', 'braceHex', 'AES_POLYNOMIAL', 'highlight', 'mathTerm', 'PairedRecorder',
      'hexDigits', 'parseHexToArray', 'readOption', 'valueRef', 'bitOf', 'SBOX', 'INV_SBOX', 'buildSbox', 'buildInvSbox',
      'ginvStepTerms', 'scopeLevels', 'opLabels', 'singleCellRegion', 'zeroSnapshot', 'runPrimitive',
      'chainIssues', 'chainActiveAt', 'chainEdgeKey', 'chainLabelRefs', 'chainLanes',
      'wireIssues', 'wireActiveOffsetsAt', 'wireTotalLength', 'wireSegmentAt', 'wireLabelRefs',
      'utf8Bytes', 'utf8Text', 'readText', 'portParamFields', 'PORT_NAMES', 'isPortName',
      'portOptions', 'preparePorts', 'portNamespaces', 'requirePort', 'checkKeyLength',
      'ChainBuilder', 'WireBuilder', 'readModeCommon', 'readBlockParamHex', 'prepareBlockCipher', 'blockLengthError', 'alignmentError',
      'blockCount', 'blockIndices', 'padStep', 'unpadStep', 'assertMatchesReference', 'BlockOpRecorder', 'blockModeOutputs', 'MODE_DIRECTIONS', 'MODE_PADDINGS', 'MODE_MAX_INPUT_BYTES',
    ];
    for (const name of expected) expect(core).toHaveProperty(name);
  });
});
