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
      'chainIssues', 'chainActiveAt', 'chainActiveNodesAt', 'chainEdgeKey', 'chainLabelRefs', 'chainLanes',
      'wireIssues', 'wireActiveOffsetsAt', 'wireTotalLength', 'wireLabelRefs',
      'utf8Bytes', 'readText', 'portParamFields', 'PORT_NAMES', 'isPortName',
      'portOptions', 'preparePorts', 'portNamespaces', 'requirePort', 'checkKeyLength',
      'ChainBuilder', 'WireBuilder', 'readModeCommon', 'readBlockParamHex', 'prepareBlockCipher', 'blockLengthError', 'alignmentError',
      'blockCount', 'blockIndices', 'padStep', 'unpadStep', 'assertMatchesReference', 'BlockOpRecorder', 'blockModeOutputs', 'MODE_DIRECTIONS', 'MODE_PADDINGS', 'MODE_MAX_INPUT_BYTES',
      'encryptInputLength', 'unpaddedInputRegion', 'recordPadding', 'cipherName', 'laneNodeId', 'chainLabel', 'cipherZoom', 'addPadNode', 'addUnpadNode', 'blockModeValues',
      'xorBytesToArray', 'u8Regions', 'recordPaddedMode', 'processedBytes', 'laneNodes', 'blockSegmentId', 'addBlockSegment', 'runPaddedMode',
      'macFunction', 'isMemberPortName', 'portMemberRef', 'parsePortMemberRef', 'portMember', 'readPortMemberRef', 'requirePortMember',
      'hashFunction', 'xofFunction', 'latestStepAt', 'validateSpongeFacet', 'validateWordopsFacet', 'WORD_OPS', 'WORD_TERM_ROLES', 'isWordOp', 'isWordTermRole',
    ];
    for (const name of expected) expect(core).toHaveProperty(name);
  });
});
