import { describe, expect, it } from 'vitest';
import * as tools from './index.ts';

describe('@cryventure/tools', () => {
  it('exposes the contract kit, parity rules and scaffold templates', () => {
    for (const name of ['primitiveContract', 'viewContract', 'loadPluginCatalogs', 'compareCatalogs', 'primitiveTemplate', 'viewTemplate', 'runWithPorts', 'runOptionsFor', 'producerRegistry', 'blockCipherProblems', 'implementedPortProblems', 'modeFacetIssues']) {
      expect(typeof (tools as Record<string, unknown>)[name], name).toBe('function');
    }
  });
});
