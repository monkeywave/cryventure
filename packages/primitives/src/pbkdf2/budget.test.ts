import { describe, expect, it } from 'vitest';
import { PBKDF2_ITERATIONS, PBKDF2_PRESETS } from './manifest.ts';
import { run } from './module.ts';
import { allHmacMembers } from '../testing/hmacPorts.ts';
import { resolverFor, testEnv } from './testMacs.ts';

/**
 * The §2e budget (docs/M7.md): a traced PBKDF2 run at the iteration cap (100000) and 32 bytes must
 * finish in under 10 s with every HMAC member, as the worker runs it. The full budget runs under
 * `CV_PERF=1` (a quiet machine, docs/EXTENDING.md); otherwise a cheap guard (c = 2000 in < 3 s, 15× the
 * budget's pro-rata 200 ms) still catches a gross slowdown without flaking on loaded 2-core CI runners
 * (where the slowest member, HMAC-SHA-512/224, took 17 s for c = 100000, i.e. about 340 ms for c = 2000).
 */
const PERF = testEnv('CV_PERF') === '1';
const BUDGET_MS = 10_000;
const ITERATIONS = PERF ? PBKDF2_ITERATIONS.max : 2000;
const LIMIT_MS = PERF ? BUDGET_MS : 3000;
const { performance } = globalThis as unknown as { performance: { now(): number } };
const members = await allHmacMembers();

/**
 * Members over budget, reported to the M7 lead rather than lowering the budget; skipped until their
 * ports are fixed. Empty since the MD5 and SHA-1 ports compress in about 0.5 µs (was 10–12 µs).
 */
const OVER_BUDGET: ReadonlySet<string> = new Set<string>();
const gated = members.filter((member) => !OVER_BUDGET.has(member.ref));

describe(`pbkdf2 budget: c = ${ITERATIONS}, 32 bytes${PERF ? ' (CV_PERF=1)' : ' (regression guard; full budget under CV_PERF=1)'}`, () => {
  it('covers HMAC members of several producers', () => {
    expect(gated.length).toBeGreaterThan(9);
  });

  it.skip.each([...OVER_BUDGET].map((ref) => [ref] as const))('%s (over budget, see OVER_BUDGET)', () => {});

  it.each(gated.map((member) => [member.ref] as const))(`%s finishes in < ${LIMIT_MS} ms`, async (ref) => {
    const params = { ...PBKDF2_PRESETS[0]!.params, mac: ref, iterations: String(ITERATIONS), length: '32' };
    const options = { resolve: await resolverFor(params) };
    const start = performance.now();
    const result = run(params, options);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(LIMIT_MS);
  }, 6 * BUDGET_MS);
});
