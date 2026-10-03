import { describe, expect, it } from 'vitest';
import type { PrimitiveManifest } from '@cryventure/core';
import { runProducer } from './runProducer.ts';
import { toyComposite, toyProducers } from './testProducers.ts';

describe('runProducer', () => {
  it('turns a failing import into a localized error', async () => {
    const broken = { load: () => Promise.reject(new Error('offline')) } as unknown as PrimitiveManifest;
    expect(await runProducer(broken, {})).toEqual({ ok: false, error: { key: 'ui.lab.error.loadFailed' } });
  });

  it('reports an exception inside run as a failed run, not a failed load', async () => {
    const throwing = { ...toyComposite, load: async () => ({ run: () => { throw new Error('boom'); } }) } as unknown as PrimitiveManifest;
    expect(await runProducer(throwing, { cipher: 'toy' }, toyProducers)).toEqual({ ok: false, error: { key: 'ui.lab.error.runFailed' } });
  });

  it('prepares the ports named by the params and passes resolve to run', async () => {
    const result = await runProducer(toyComposite, { cipher: 'toy' }, toyProducers);
    expect(result.ok && result.trace.output).toEqual({ cipher: [1] });
  });

  it('reports a port that no registered producer provides as a run error', async () => {
    const result = await runProducer(toyComposite, { cipher: 'nope' }, toyProducers);
    expect(result).toEqual({ ok: false, error: { key: 'core.error.portMissing', params: { id: 'nope' } } });
  });
});
