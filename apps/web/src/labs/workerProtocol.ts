import { i18nRef, type ProducerLookup, type RunResult } from '@cryventure/core';
import { LOAD_FAILED, runProducer } from './runProducer.ts';

/**
 * Messages between the lab host and `producer.worker.ts` (docs/M3.md §8). One worker serves one run:
 * the host posts a request, the worker answers with the run result as JSON, and the host terminates it.
 */
export interface WorkerRunRequest {
  producerId: string;
  params: unknown;
}

/** The run result serialized as JSON (a bundle must be JSON-serializable, docs/EXTENDING.md `runIn`). */
export interface WorkerRunResponse {
  resultJson: string;
}

function isRunRequest(data: unknown): data is WorkerRunRequest {
  return typeof data === 'object' && data !== null && typeof (data as { producerId?: unknown }).producerId === 'string';
}

const LOAD_FAILED_RESPONSE: WorkerRunResponse = { resultJson: JSON.stringify(LOAD_FAILED) };

/**
 * Worker side: looks the producer up in the worker's own registry, prepares its ports and runs it.
 * Never rejects: anything that goes wrong (including a bundle that cannot be serialized) answers as a failed load.
 */
export async function handleRunRequest(data: unknown, producers: ProducerLookup): Promise<WorkerRunResponse> {
  try {
    return { resultJson: JSON.stringify(await resultFor(data, producers)) };
  } catch {
    return LOAD_FAILED_RESPONSE;
  }
}

/** Worker side: answers one run request via `post`; if posting the answer throws, posts a failed load instead, so the host never waits forever. */
export async function answerRunRequest(data: unknown, producers: ProducerLookup, post: (response: WorkerRunResponse) => void): Promise<void> {
  const response = await handleRunRequest(data, producers);
  try {
    post(response);
  } catch {
    post(LOAD_FAILED_RESPONSE);
  }
}

async function resultFor(data: unknown, producers: ProducerLookup): Promise<RunResult> {
  if (!isRunRequest(data)) return LOAD_FAILED;
  const producer = producers.get(data.producerId);
  if (producer === undefined) return { ok: false, error: i18nRef('ui.lab.error.unknownProducer', { id: data.producerId }) };
  return runProducer(producer, data.params, producers);
}

function isRunResult(value: unknown): value is RunResult {
  if (typeof value !== 'object' || value === null) return false;
  const { ok, trace, error } = value as { ok?: unknown; trace?: unknown; error?: unknown };
  return ok === true ? typeof trace === 'object' && trace !== null : ok === false && typeof error === 'object' && error !== null;
}

/** Host side: the run result a worker answered with; anything malformed counts as a failed load. */
export function readRunResponse(data: unknown): RunResult {
  const json = (data as Partial<WorkerRunResponse> | null)?.resultJson;
  if (typeof json !== 'string') return LOAD_FAILED;
  try {
    const parsed: unknown = JSON.parse(json);
    return isRunResult(parsed) ? parsed : LOAD_FAILED;
  } catch {
    return LOAD_FAILED;
  }
}
