import { describe, expect, it } from 'vitest';
import { handleRunRequest, readRunResponse } from './workerProtocol.ts';
import { toyProducers } from './testProducers.ts';

const LOAD_FAILED = { ok: false, error: { key: 'ui.lab.error.loadFailed' } };

describe('handleRunRequest (worker side)', () => {
  it('runs the named producer with its ports and answers with the result as JSON', async () => {
    const response = await handleRunRequest({ producerId: 'toy-mode', params: { cipher: 'toy' } }, toyProducers);
    expect(JSON.parse(response.resultJson)).toMatchObject({ ok: true, trace: { output: { cipher: [1] } } });
  });

  it('answers an unknown producer with the unknown-producer error', async () => {
    const response = await handleRunRequest({ producerId: 'ghost', params: {} }, toyProducers);
    expect(JSON.parse(response.resultJson)).toEqual({ ok: false, error: { key: 'ui.lab.error.unknownProducer', params: { id: 'ghost' } } });
  });

  it('answers a malformed request with a failed load', async () => {
    expect(JSON.parse((await handleRunRequest('run!', toyProducers)).resultJson)).toEqual(LOAD_FAILED);
  });
});

describe('readRunResponse (host side)', () => {
  it('round-trips what the worker posts', async () => {
    const response = await handleRunRequest({ producerId: 'toy-mode', params: { cipher: 'toy' } }, toyProducers);
    expect(readRunResponse(response)).toMatchObject({ ok: true, trace: { params: { cipher: 'toy' } } });
  });

  it.each([null, {}, { resultJson: 42 }, { resultJson: '{not json' }, { resultJson: '{"ok":true}' }, { resultJson: '{"ok":"yes"}' }])('treats %j as a failed load', (data) => {
    expect(readRunResponse(data)).toEqual(LOAD_FAILED);
  });
});
