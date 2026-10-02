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
      'stateAt', 'nearestKeyframe', 'valueId', 'narrationAt', 'narrationFromState',
      'Registry', 'definePrimitive', 'defineView', 'defineDeriver', 'viewsFor', 'reachableFacetKinds',
      'inferHexFields', 'paramFieldsOf', 'paramFieldKeys', 'optionLabelKey',
      'allIndices', 'braceHex', 'AES_POLYNOMIAL', 'highlight', 'mathTerm', 'PairedRecorder',
    ];
    for (const name of expected) expect(core).toHaveProperty(name);
  });
});
