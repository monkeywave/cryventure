/**
 * Pure license-check logic for `pnpm licenses:check` (docs/M4.md §9). `check.ts` feeds it the output
 * of `pnpm licenses list --json`; nothing here does I/O.
 */
import type { LicenseException } from './policy.ts';

/** One package entry of `pnpm licenses list --json` (grouped by license at the top level). */
export interface PnpmLicenseEntry {
  readonly name: string;
  readonly versions: readonly string[];
  readonly license: string;
}
export type PnpmLicenseReport = Readonly<Record<string, readonly PnpmLicenseEntry[]>>;

export interface LicensePolicy {
  readonly allowed: ReadonlySet<string>;
  readonly exceptions: readonly LicenseException[];
}

export interface LicenseViolation {
  readonly name: string;
  readonly versions: readonly string[];
  readonly license: string;
}

export interface LicenseCheckResult {
  readonly packages: number;
  readonly violations: readonly LicenseViolation[];
  /** Packages accepted only through an exception (reported, so they stay visible). */
  readonly excepted: readonly LicenseViolation[];
}

/**
 * Whether an SPDX expression is acceptable: `A OR B` needs one allowed side, `A AND B` both,
 * parentheses group. Anything else (`WITH`, `SEE LICENSE IN`, unknown ids) must be allowed verbatim.
 */
export function isExpressionAllowed(expression: string, allowed: ReadonlySet<string>): boolean {
  const trimmed = stripOuterParens(expression.trim());
  if (allowed.has(trimmed)) return true;
  const orParts = splitTopLevel(trimmed, 'OR');
  if (orParts.length > 1) return orParts.some((part) => isExpressionAllowed(part, allowed));
  const andParts = splitTopLevel(trimmed, 'AND');
  if (andParts.length > 1) return andParts.every((part) => isExpressionAllowed(part, allowed));
  return false;
}

/** Removes parentheses that wrap the whole expression: `((MIT OR ISC))` → `MIT OR ISC`. */
function stripOuterParens(expression: string): string {
  let current = expression;
  while (current.startsWith('(') && current.endsWith(')') && closingParenOf(current) === current.length - 1) {
    current = current.slice(1, -1).trim();
  }
  return current;
}

function closingParenOf(expression: string): number {
  let depth = 0;
  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === '(') depth += 1;
    if (expression[index] === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

/** Splits on ` OR ` / ` AND ` outside parentheses. */
function splitTopLevel(expression: string, operator: 'OR' | 'AND'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  const token = ` ${operator} `;
  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (depth === 0 && expression.startsWith(token, index)) {
      parts.push(expression.slice(start, index));
      start = index + token.length;
      index = start - 1;
    }
  }
  parts.push(expression.slice(start));
  return parts.map((part) => part.trim());
}

function matchesName({ name: pattern, pattern: regex }: LicenseException, name: string): boolean {
  if (regex !== undefined) return regex.test(name);
  return pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
}

export function findException(entry: PnpmLicenseEntry, exceptions: readonly LicenseException[]): LicenseException | undefined {
  return exceptions.find((exception) => exception.license === entry.license && matchesName(exception, entry.name));
}

/** Classifies every package of a report against the policy. */
export function checkLicenses(report: PnpmLicenseReport, policy: LicensePolicy): LicenseCheckResult {
  const entries = Object.values(report).flat();
  const rejected = entries.filter((entry) => !isExpressionAllowed(entry.license, policy.allowed));
  const toViolation = ({ name, versions, license }: PnpmLicenseEntry): LicenseViolation => ({ name, versions, license });
  return {
    packages: entries.length,
    violations: rejected.filter((entry) => !findException(entry, policy.exceptions)).map(toViolation),
    excepted: rejected.filter((entry) => findException(entry, policy.exceptions)).map(toViolation),
  };
}

/** CLI output lines; violations first so CI logs show them at the top. */
export function formatLicenseResult(result: LicenseCheckResult): string[] {
  const describe = (entry: LicenseViolation) => `${entry.name}@${entry.versions.join(', ')} (${entry.license})`;
  return [
    ...result.violations.map((entry) => `✗ not allowed: ${describe(entry)}`),
    ...result.excepted.map((entry) => `· reviewed exception: ${describe(entry)}`),
    `licenses: ${result.packages} packages, ${result.violations.length} violation(s), ${result.excepted.length} reviewed exception(s)`,
  ];
}
