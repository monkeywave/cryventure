import { decodeJsonBase64Url, encodeJsonBase64Url } from './base64url.ts';

/**
 * Lab deep links live in the URL hash (never sent to servers or logs — docs/PLAN.md §2):
 * `#lab=<labId>&p=<base64url JSON params>&s=<step>&v=1`, repeated once per lab on the page.
 */
export const DEEP_LINK_VERSION = 1;
export const MAX_HASH_LENGTH = 2048;
export const HASH_WRITE_DELAY_MS = 250;

export interface LabLinkState {
  params?: unknown;
  step?: number;
}

export type LabLinkRead = { status: 'absent' } | { status: 'valid'; state: LabLinkState } | { status: 'invalid' };

type Fields = Map<string, string>;

const MIN_STEP = -1;

/** Splits `lab=a&p=..&s=..&lab=b&..` into one field map per lab id (later duplicates win). */
export function parseLabGroups(hash: string): Map<string, Fields> {
  const groups = new Map<string, Fields>();
  let current: Fields | undefined;
  for (const token of hash.replace(/^#/, '').split('&')) {
    const [name = '', value = ''] = splitToken(token);
    if (name === 'lab') groups.set(value, (current = new Map()));
    else if (current !== undefined && name !== '') current.set(name, value);
  }
  return groups;
}

function splitToken(token: string): [string, string] {
  const at = token.indexOf('=');
  const raw = at < 0 ? [token, ''] : [token.slice(0, at), token.slice(at + 1)];
  try {
    return [decodeURIComponent(raw[0] ?? ''), decodeURIComponent(raw[1] ?? '')];
  } catch {
    return ['', ''];
  }
}

function decodeStep(text: string | undefined): { ok: boolean; step?: number } {
  if (text === undefined) return { ok: true };
  const step = Number(text);
  const valid = /^-?\d+$/.test(text) && Number.isSafeInteger(step) && step >= MIN_STEP;
  return valid ? { ok: true, step } : { ok: false };
}

function decodeParams(text: string | undefined): { ok: boolean; params?: unknown } {
  if (text === undefined) return { ok: true };
  const decoded = decodeJsonBase64Url(text);
  return decoded.ok ? { ok: true, params: decoded.value } : { ok: false };
}

/** Decodes one lab's fields; any malformed part (or a foreign version) marks it invalid. */
export function decodeLabFields(fields: Fields): LabLinkRead {
  if (fields.get('v') !== String(DEEP_LINK_VERSION)) return { status: 'invalid' };
  const step = decodeStep(fields.get('s'));
  const params = decodeParams(fields.get('p'));
  if (!step.ok || !params.ok) return { status: 'invalid' };
  const state: LabLinkState = {};
  if (params.params !== undefined) state.params = params.params;
  if (step.step !== undefined) state.step = step.step;
  return { status: 'valid', state };
}

/** Tolerant read of one lab's state from a hash; oversized hashes are rejected as invalid. */
export function readLabLink(hash: string, labId: string): LabLinkRead {
  const fields = parseLabGroups(hash).get(labId);
  if (fields === undefined) return { status: 'absent' };
  if (hash.length > MAX_HASH_LENGTH) return { status: 'invalid' };
  return decodeLabFields(fields);
}

function encodeGroup(labId: string, state: LabLinkState): string {
  const parts = [`lab=${encodeURIComponent(labId)}`];
  if (state.params !== undefined) parts.push(`p=${encodeJsonBase64Url(state.params)}`);
  if (state.step !== undefined) parts.push(`s=${state.step}`);
  parts.push(`v=${DEEP_LINK_VERSION}`);
  return parts.join('&');
}

/** Serialises lab states in insertion order, without the leading `#`. */
export function encodeLabStates(labs: ReadonlyMap<string, LabLinkState>): string {
  return [...labs].map(([labId, state]) => encodeGroup(labId, state)).join('&');
}

function validStatesOf(hash: string): Map<string, LabLinkState> {
  const states = new Map<string, LabLinkState>();
  for (const [labId, fields] of parseLabGroups(hash)) {
    const read = decodeLabFields(fields);
    if (read.status === 'valid') states.set(labId, read.state);
  }
  return states;
}

/**
 * Returns the new hash (no `#`) with `labId` set to `state`, keeping other labs. Over the 2 KB cap
 * the params are dropped (step only); `null` means even that does not fit.
 */
export function withLabState(hash: string, labId: string, state: LabLinkState): string | null {
  const states = validStatesOf(hash);
  states.set(labId, state);
  const full = encodeLabStates(states);
  if (full.length + 1 <= MAX_HASH_LENGTH) return full;
  states.set(labId, { step: state.step });
  const stepOnly = encodeLabStates(states);
  return stepOnly.length + 1 <= MAX_HASH_LENGTH ? stepOnly : null;
}

/** Returns the new hash (no `#`) without `labId`. */
export function withoutLab(hash: string, labId: string): string {
  const states = validStatesOf(hash);
  states.delete(labId);
  return encodeLabStates(states);
}
