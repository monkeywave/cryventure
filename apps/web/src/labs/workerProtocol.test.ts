import { describe, expect, it, vi } from 'vitest';
import type { PrimitiveManifest, ProducerLookup } from '@cryventure/core';
import { answerRunRequest, handleRunRequest, readRunResponse } from './workerProtocol.ts';
import { toyComposite, toyProducers } from './testProducers.ts';

/** A producer whose bundle cannot be serialized (a BigInt in its output). */
const unserializable = { ...toyComposite, load: async () => ({ run: () => ({ ok: true, trace: { output: { n: 1n } } }) }) } as unknown as PrimitiveManifest;
const unserializableProducers: ProducerLookup = { get: (id) => (id === 'toy-mode' ? unserializable : undefined) };

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

describe('answerRunRequest (worker side)', () => {
  it('answers with a failed load when the result cannot be serialized', async () => {
    const response = await handleRunRequest({ producerId: 'toy-mode', params: {} }, unserializableProducers);
    expect(JSON.parse(response.resultJson)).toEqual(LOAD_FAILED);
  });

  it('posts a failed load when posting the result throws', async () => {
    const post = vi.fn().mockImplementationOnce(() => {
      throw new Error('DataCloneError');
    });
    await answerRunRequest({ producerId: 'toy-mode', params: { cipher: 'toy' } }, toyProducers, post);
    expect(post).toHaveBeenCalledTimes(2);
    expect(readRunResponse(post.mock.calls[1]?.[0])).toEqual(LOAD_FAILED);
  });

  it('posts a failed load when the run request handling itself rejects', async () => {
    const post = vi.fn();
    const failing: ProducerLookup = {
      get: () => {
        throw new Error('registry broken');
      },
    };
    await answerRunRequest({ producerId: 'toy-mode', params: {} }, failing, post);
    expect(readRunResponse(post.mock.calls[0]?.[0])).toEqual(LOAD_FAILED);
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
