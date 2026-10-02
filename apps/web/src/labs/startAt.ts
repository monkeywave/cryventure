import { INITIAL_STEP, LAB_MODES, type AnyStateStep, type LabMode } from '@cryventure/viz';

/**
 * Lesson-authored start position of a lab (`<Lab startAt="…">`), used when the deep link has no step:
 * - `step:N` — the player's "Step N" (1-based as displayed; `step:0` is the initial state),
 * - `key:value,key:value` — the first step whose fields all match, e.g. `round:1,op:subBytes`.
 */
export type StartAt = { kind: 'step'; step: number } | { kind: 'match'; fields: Readonly<Record<string, string | number>> };

const PAIR = /^([A-Za-z_]\w*):([\w-]+)$/;
const INTEGER = /^-?\d+$/;

function fieldValue(text: string): string | number {
  return INTEGER.test(text) ? Number(text) : text;
}

function parsePairs(text: string): [string, string][] | undefined {
  const pairs = text.split(',').map((part) => PAIR.exec(part.trim()));
  if (pairs.some((match) => match === null)) return undefined;
  return pairs.map((match) => [match![1]!, match![2]!]);
}

function displayedStep(value: string): StartAt | undefined {
  const step = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(step) ? { kind: 'step', step: step - 1 } : undefined;
}

/** Parses a `startAt` attribute; `undefined` when it is malformed. */
export function parseStartAt(text: string): StartAt | undefined {
  const pairs = parsePairs(text);
  if (pairs === undefined || pairs.length === 0) return undefined;
  const keys = new Set(pairs.map(([key]) => key));
  if (keys.size !== pairs.length) return undefined;
  if (keys.has('step')) return pairs.length === 1 ? displayedStep(pairs[0]![1]) : undefined;
  return { kind: 'match', fields: Object.fromEntries(pairs.map(([key, value]) => [key, fieldValue(value)])) };
}

function matches(step: AnyStateStep, fields: StartAt & { kind: 'match' }): boolean {
  const record = step as unknown as Record<string, unknown>;
  return Object.entries(fields.fields).every(([key, value]) => record[key] === value);
}

/** Step index `startAt` points to in `steps`, else the initial step. Out-of-range steps are left to `store.seek`, which clamps. */
export function resolveStartAt(startAt: StartAt | undefined, steps: readonly AnyStateStep[]): number {
  if (startAt === undefined) return INITIAL_STEP;
  if (startAt.kind === 'step') return startAt.step;
  const index = steps.findIndex((step) => matches(step, startAt));
  return index < 0 ? INITIAL_STEP : index;
}

/** The step a lab opens at: the deep link's step wins, then `startAt`, then the initial state. */
export function initialStep(linkStep: number | undefined, startAt: StartAt | undefined, steps: readonly AnyStateStep[]): number {
  return linkStep ?? resolveStartAt(startAt, steps);
}

/** Whether `value` is a lab mode (`story` | `debugger`). */
export function isLabMode(value: string | undefined): value is LabMode {
  return LAB_MODES.includes(value as LabMode);
}
