import { describe, expect, it } from 'vitest';
import { PBKDF2_ITERATIONS, PBKDF2_PRESETS } from './manifest.ts';
import { run } from './module.ts';
import { allHmacMembers, resolverFor } from './testMacs.ts';

/**
 * The §2e budget (docs/M7.md): a traced PBKDF2 run at the iteration cap (100000) and 32 bytes must
 * finish in under 10 s with every HMAC member, as the worker runs it.
 */
const BUDGET_MS = 10_000;
const { performance } = globalThis as unknown as { performance: { now(): number } };
const members = await allHmacMembers();

/**
 * Members over budget, reported to the M7 lead rather than lowering the budget; skipped until their
 * ports are fixed. Empty since the MD5 and SHA-1 ports compress in about 0.5 µs (was 10–12 µs).
 */
const OVER_BUDGET: ReadonlySet<string> = new Set<string>();
const gated = members.filter((member) => !OVER_BUDGET.has(member.ref));

describe('pbkdf2 budget: c = 100000, 32 bytes', () => {
  it('covers HMAC members of several producers', () => {
    expect(gated.length).toBeGreaterThan(9);
  });

  it.skip.each([...OVER_BUDGET].map((ref) => [ref] as const))('%s (over budget, see OVER_BUDGET)', () => {});

  it.each(gated.map((member) => [member.ref] as const))('%s finishes in < 10 s', async (ref) => {
    const params = { ...PBKDF2_PRESETS[0]!.params, mac: ref, iterations: String(PBKDF2_ITERATIONS.max), length: '32' };
    const options = { resolve: await resolverFor(params) };
    const start = performance.now();
    const result = run(params, options);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  }, 4 * BUDGET_MS);
});
