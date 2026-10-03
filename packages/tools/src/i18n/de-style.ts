import { parsePluralKey, replacePlaceholders } from '@cryventure/core';
import type { FlatCatalog, ParityIssue, Severity } from './parity.ts';

/**
 * German style lint for DE catalogs and DE MDX pages (pure, no I/O). The rules implement the
 * style guide and term base in `docs/GLOSSARY.md`; keep both in sync.
 */

export interface StyleRule {
  id: string;
  severity: Severity;
  pattern: RegExp;
  message: string;
}

/** Glossary decisions: rejected variants (errors) and doubtful ones (warnings). Case-sensitive. */
export const GLOSSARY_RULES: readonly StyleRule[] = [
  { id: 'term', severity: 'error', pattern: /\bChiffre?text\p{L}*/gu, message: 'use "Geheimtext" (glossary: ciphertext)' },
  { id: 'term', severity: 'error', pattern: /\bChiffrat\p{L}*/gu, message: 'use "Geheimtext" (glossary: ciphertext)' },
  { id: 'term', severity: 'error', pattern: /\b(?:Ciphertext|Plaintext)\b/g, message: 'use "Geheimtext" / "Klartext" in German prose' },
  { id: 'term', severity: 'error', pattern: /\bS-box\b|\bS[Bb]ox\b/g, message: 'write "S-Box" (glossary)' },
  { id: 'term', severity: 'error', pattern: /\bKonstantzeit\p{L}*/gu, message: 'use "konstante Laufzeit" (glossary: constant-time)' },
  { id: 'term', severity: 'error', pattern: /\bSchlüsselablaufplan\p{L}*/gu, message: 'use "Schlüsselplan" (glossary: key schedule)' },
  { id: 'term', severity: 'error', pattern: /\bAuthentifizierungstag\p{L}*/gu, message: 'write "Authentifizierungs-Tag" (glossary: authentication tag)' },
  { id: 'term', severity: 'error', pattern: /\bGalois-?[Ff]eld\p{L}*/gu, message: 'use "Galoiskörper" („Körper“, never „Feld“; glossary: Galois field)' },
  { id: 'term', severity: 'warning', pattern: /\bGalois-Körper\p{L}*/gu, message: 'write "Galoiskörper" (glossary: Galois field)' },
  { id: 'term', severity: 'warning', pattern: /\bByte-Reihenfolge\p{L}*/gu, message: 'write "Bytereihenfolge" (glossary: byte order)' },
  { id: 'term', severity: 'warning', pattern: /\bLabor\b/g, message: 'the glossary term is "das Lab"' },
];

/** Abbreviations that need a (narrow no-break) space between their parts: "z. B.", "d. h.". */
const ABBREVIATION = /\b(?:z\.B|d\.h|u\.a|z\.T|u\.U|o\.Ä|i\.d\.R|s\.o|s\.u)\./g;

/** Nouns whose plural form after "1" (or in a `_one` variant) reveals a missing plural form. */
const PLURAL_NOUNS = 'Positionen|Runden|Schritte|Schritten|Wörter|Wörtern|Zeilen|Spalten|Bytes|Bits|Einträge|Operationen|Tabellen|Sekunden';
const ONE_WITH_PLURAL = new RegExp(`(?<![\\d.,])\\b1\\s+(?:${PLURAL_NOUNS})\\b`, 'g');
const COUNT_WITH_PLURAL = new RegExp(`\\{\\{\\s*count\\s*\\}\\}\\s+(?:${PLURAL_NOUNS})\\b`);

const FORMAL_PRONOUN = /\b(?:Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihres)\b/g;
/** A capitalized pronoun after one of these (or at the start) may begin a sentence: "Sie" = they. */
const SENTENCE_BOUNDARY = /[.!?:;#>|„“"(\-–*\d\uE000]$/u;

/** Exact text snippets in which a capitalized "Sie"/"Ihr…" is fine (e.g. a quoted title). */
export const FORMAL_ADDRESS_ALLOWLIST: readonly string[] = [];

const MASK = '\uE000';

export interface StyleOptions {
  formalAllowlist?: readonly string[];
}

function lineAt(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function previousVisible(text: string, index: number): string {
  return text.slice(0, index).replace(/\s+$/u, '').slice(-1);
}

interface Finding {
  index: number;
  severity: Severity;
  message: string;
}

function ruleFindings(text: string, rule: Pick<StyleRule, 'pattern' | 'severity'>, message: (match: string) => string): Finding[] {
  return Array.from(text.matchAll(rule.pattern), (match) => ({ index: match.index, severity: rule.severity, message: message(match[0]) }));
}

function formalAddressFindings(text: string, allowlist: readonly string[]): Finding[] {
  return Array.from(text.matchAll(FORMAL_PRONOUN))
    .filter((match) => {
      const before = previousVisible(text, match.index);
      return before !== '' && !SENTENCE_BOUNDARY.test(before);
    })
    .filter((match) => !allowlist.some((snippet) => text.includes(snippet) && snippet.includes(match[0])))
    .map((match) => ({ index: match.index, severity: 'error' as const, message: `formal address "${match[0]}" mid-sentence; use the du-form` }));
}

/** All style findings for one stretch of German prose (code already masked out). */
function proseFindings(text: string, options: StyleOptions): Finding[] {
  return [
    ...ruleFindings(text, { pattern: /"/g, severity: 'error' }, () => 'straight double quote; use „…“'),
    ...ruleFindings(text, { pattern: ABBREVIATION, severity: 'error' }, (match) => `"${match}" needs a space: "${match.replace('.', '. ')}"`),
    ...ruleFindings(text, { pattern: /[^\s\uE000] {2,}(?=[^\s\uE000])/g, severity: 'error' }, () => 'double space'),
    ...ruleFindings(text, { pattern: ONE_WITH_PLURAL, severity: 'error' }, (match) => `"${match}": singular noun needed after 1 (or use a plural key)`),
    ...ruleFindings(text, { pattern: / — /g, severity: 'warning' }, () => 'em dash; German uses a spaced en dash " – "'),
    ...ruleFindings(text, { pattern: /\.\.\./g, severity: 'warning' }, () => 'three dots; use the ellipsis "…"'),
    ...GLOSSARY_RULES.flatMap((rule) => ruleFindings(text, rule, (match) => `"${match}": ${rule.message}`)),
    ...formalAddressFindings(text, options.formalAllowlist ?? FORMAL_ADDRESS_ALLOWLIST),
  ];
}

function countFindings(key: string, value: string): Finding[] {
  const category = parsePluralKey(key)?.category;
  if (category === 'other' || !COUNT_WITH_PLURAL.test(value)) return [];
  return category === 'one'
    ? [{ index: 0, severity: 'error', message: 'plural noun in a "_one" form' }]
    : [{ index: 0, severity: 'warning', message: '{{count}} with a plural noun in a non-plural key; add "_one"/"_other" forms' }];
}

/** Lints the values of a flat DE catalog (`{{params}}` masked); also checks how `{{count}}` is used. */
export function lintGermanCatalog(catalog: FlatCatalog, file: string, options: StyleOptions = {}): ParityIssue[] {
  return Object.entries(catalog).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [];
    const prose = replacePlaceholders(value, blank);
    const findings = [...proseFindings(prose, options), ...countFindings(key, value)];
    return findings.map((finding) => ({ severity: finding.severity, file, key, message: `style: ${finding.message}` }));
  });
}

/** Frontmatter keys whose values are German prose. */
const PROSE_FRONTMATTER = /^(\s*(?:-\s+)?(?:title|description|tagline|text):\s*)(.*)$/;
/** JSX/HTML attributes whose values are German prose; all other attribute values are identifiers. */
const PROSE_ATTRIBUTES = new Set(['title', 'caption', 'question', 'label', 'value', 'input', 'output', 'description', 'text', 'alt', 'aria-label']);

function blank(segment: string): string {
  return segment.replace(/[^\n]/g, MASK);
}

function maskFrontmatter(source: string): string {
  const match = /^---\n[\s\S]*?\n---\n/.exec(source);
  if (match === null) return source;
  const masked = match[0]
    .split('\n')
    .map((line) => {
      const prose = PROSE_FRONTMATTER.exec(line);
      return prose === null ? blank(line) : blank(prose[1] ?? '') + (prose[2] ?? '').replace(/^(['"])(.*)\1$/, `${MASK}$2${MASK}`);
    })
    .join('\n');
  return masked + source.slice(match[0].length);
}

function maskAttributes(text: string): string {
  return text.replace(/([A-Za-z][\w-]*)="([^"]*)"/g, (whole, name: string, value: string) =>
    PROSE_ATTRIBUTES.has(name) ? `${blank(`${name}="`)}${value}${MASK}` : blank(whole),
  );
}

/** Replaces everything that is not German prose by NUL (newlines kept, so line numbers stay right). */
export function maskMdx(source: string): string {
  const steps: Array<[RegExp, (match: string) => string]> = [
    [/```[\s\S]*?```/g, blank],
    [/\{`[\s\S]*?`\}/g, blank],
    [/<!--[\s\S]*?-->|\{\/\*[\s\S]*?\*\/\}/g, blank],
    [/^(?:import|export)\s.*$/gm, blank],
    [/`[^`\n]*`/g, blank],
    [/\]\([^)\s]*\)/g, blank],
    [/<\/?[A-Za-z][\w.]*|\/?>/g, blank],
  ];
  const masked = steps.reduce((text, [pattern, replace]) => text.replace(pattern, replace), maskFrontmatter(source));
  return maskAttributes(masked);
}

/** Lints one DE MDX page; issues carry the 1-based line as `key`. */
export function lintGermanMdx(source: string, file: string, options: StyleOptions = {}): ParityIssue[] {
  const text = maskMdx(source);
  return proseFindings(text, options)
    .sort((a, b) => a.index - b.index)
    .map((finding) => ({ severity: finding.severity, file, key: `line ${lineAt(text, finding.index)}`, message: `style: ${finding.message}` }));
}
