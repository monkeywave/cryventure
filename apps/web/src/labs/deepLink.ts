import { INITIAL_STEP } from '@cryventure/viz';
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
  const valid = /^-?\d+$/.test(text) && Number.isSafeInteger(step) && step >= INITIAL_STEP;
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
 * Tokens before the first lab group, kept verbatim — e.g. a Starlight heading id, so that
 * `#how-it-works&lab=…` still names the heading (see `headingAnchor`).
 */
function foreignPrefix(hash: string): string {
  const tokens = hash.replace(/^#/, '').split('&');
  const firstLab = tokens.findIndex((token) => splitToken(token)[0] === 'lab');
  return (firstLab < 0 ? tokens : tokens.slice(0, firstLab)).filter((token) => token !== '').join('&');
}

function joinHash(prefix: string, labs: string): string {
  return [prefix, labs].filter((part) => part !== '').join('&');
}

/**
 * The heading id a combined hash (`#<id>&lab=…`) points to. The browser cannot scroll to it on its
 * own (no element has the whole fragment as id), so the page does; `undefined` without lab state.
 */
export function headingAnchor(hash: string): string | undefined {
  if (parseLabGroups(hash).size === 0) return undefined;
  const [first = ''] = foreignPrefix(hash).split('&');
  if (first === '' || first.includes('=')) return undefined;
  try {
    return decodeURIComponent(first);
  } catch {
    return undefined;
  }
}

/**
 * Returns the new hash (no `#`) with `labId` set to `state`, keeping other labs and a leading heading
 * anchor. `null` when it would exceed the 2 KB cap: a step is never stored without its params, which
 * on reload would be applied to the preset's (different) trace — the caller drops the entry instead.
 */
export function withLabState(hash: string, labId: string, state: LabLinkState): string | null {
  const states = validStatesOf(hash);
  states.set(labId, state);
  const next = joinHash(foreignPrefix(hash), encodeLabStates(states));
  return next.length + 1 <= MAX_HASH_LENGTH ? next : null;
}

/** Returns the new hash (no `#`) without `labId`, keeping other labs and a leading heading anchor. */
export function withoutLab(hash: string, labId: string): string {
  const states = validStatesOf(hash);
  states.delete(labId);
  return joinHash(foreignPrefix(hash), encodeLabStates(states));
}
