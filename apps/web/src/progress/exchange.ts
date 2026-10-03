import { isSupportedVersion, migrate } from './migrations.ts';
import type { Progress } from './schema.ts';

export const EXCHANGE_FORMAT = 'cryventure-progress';

export type ImportError = 'invalid-json' | 'wrong-format' | 'unsupported-version';
export type ImportResult = { ok: true; progress: Progress } | { ok: false; error: ImportError };

/** Pretty JSON of the progress, tagged with the exchange `format` marker. */
export function exportProgress(progress: Progress): string {
  return `${JSON.stringify({ format: EXCHANGE_FORMAT, ...progress }, null, 2)}\n`;
}

function parseJson(json: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch {
    return { ok: false };
  }
}

function hasFormatMarker(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && (value as { format?: unknown }).format === EXCHANGE_FORMAT;
}

/** Validates an exported file; errors are codes for the UI to translate. */
export function importProgress(json: string): ImportResult {
  const parsed = parseJson(json);
  if (!parsed.ok) return { ok: false, error: 'invalid-json' };
  if (!hasFormatMarker(parsed.value)) return { ok: false, error: 'wrong-format' };
  const { format: _format, ...record } = parsed.value;
  if (!isSupportedVersion(record)) return { ok: false, error: 'unsupported-version' };
  return { ok: true, progress: migrate(record) };
}
