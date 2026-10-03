import { describe, expect, it } from 'vitest';
import { opLabels, scopeLevels } from './labels.ts';

describe('scopeLevels', () => {
  it('derives label, next and previous keys per level, outermost first', () => {
    expect(scopeLevels('plugin.x', 'round', 'op')).toEqual([
      { labelKey: 'plugin.x.scope.round', nextKey: 'plugin.x.scope.roundNext', prevKey: 'plugin.x.scope.roundPrev' },
      { labelKey: 'plugin.x.scope.op', nextKey: 'plugin.x.scope.opNext', prevKey: 'plugin.x.scope.opPrev' },
    ]);
  });
});

describe('opLabels', () => {
  it('derives full and short label keys per op', () => {
    expect(opLabels('plugin.x', ['load', 'xor'])).toEqual({
      load: { labelKey: 'plugin.x.op.load', shortLabelKey: 'plugin.x.opShort.load' },
      xor: { labelKey: 'plugin.x.op.xor', shortLabelKey: 'plugin.x.opShort.xor' },
    });
  });
});
