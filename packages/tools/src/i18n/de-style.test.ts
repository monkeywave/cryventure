import { describe, expect, it } from 'vitest';
import { lintGermanCatalog, lintGermanMdx, maskMdx } from './de-style.ts';

const summary = (issues: ReturnType<typeof lintGermanCatalog>) => issues.map((entry) => `${entry.severity}:${entry.key}:${entry.message}`);
const lintValue = (value: string, key = 'k') => summary(lintGermanCatalog({ [key]: value }, 'de.json'));

describe('lintGermanCatalog', () => {
  it('accepts clean German', () => {
    expect(lintValue('Runde {{round}}: Der Zustand wird mit „{{name}}“ XOR-verknüpft, z. B. so – d. h. gut …')).toEqual([]);
  });

  it('flags straight double quotes but not inside {{params}}', () => {
    expect(lintValue('Unbekannt: "{{detail}}"')).toEqual(['error:k:style: straight double quote; use „…“', 'error:k:style: straight double quote; use „…“']);
  });

  it('flags abbreviations without a space and double spaces', () => {
    expect(lintValue('Das ist z.B. so')).toEqual(['error:k:style: "z.B." needs a space: "z. B."']);
    expect(lintValue('d.h. nichts')).toEqual(['error:k:style: "d.h." needs a space: "d. h."']);
    expect(lintValue('zwei  Leerzeichen')).toEqual(['error:k:style: double space']);
  });

  it('flags rejected glossary variants', () => {
    expect(lintValue('Der Chiffretext')).toEqual(['error:k:style: "Chiffretext": use "Geheimtext" (glossary: ciphertext)']);
    expect(lintValue('das Chiffrat')).toEqual(['error:k:style: "Chiffrat": use "Geheimtext" (glossary: ciphertext)']);
    expect(lintValue('die S-box')).toEqual(['error:k:style: "S-box": write "S-Box" (glossary)']);
    expect(lintValue('Dieses Labor')).toEqual(['warning:k:style: "Labor": the glossary term is "das Lab"']);
    expect(lintValue('das Authentifizierungstag')).toEqual(['error:k:style: "Authentifizierungstag": write "Authentifizierungs-Tag" (glossary: authentication tag)']);
    expect(lintValue('das Galoisfeld')).toEqual(['error:k:style: "Galoisfeld": use "Galoiskörper" („Körper“, never „Feld“; glossary: Galois field)']);
    expect(lintValue('der Galois-Körper')).toEqual(['warning:k:style: "Galois-Körper": write "Galoiskörper" (glossary: Galois field)']);
    expect(lintValue('die Byte-Reihenfolge')).toEqual(['warning:k:style: "Byte-Reihenfolge": write "Bytereihenfolge" (glossary: byte order)']);
    expect(lintValue('Authentifizierungs-Tag, Galoiskörper, Bytereihenfolge')).toEqual([]);
  });

  it('flags formal address mid-sentence but not sentence-initial "Sie" (they)', () => {
    expect(lintValue('Bitte prüfen Sie Ihre Verbindung.')).toEqual([
      'error:k:style: formal address "Sie" mid-sentence; use the du-form',
      'error:k:style: formal address "Ihre" mid-sentence; use the du-form',
    ]);
    expect(lintValue('Die S-Box ist fest. Sie hat 256 Einträge.')).toEqual([]);
    expect(lintValue('Spalte {{col}}: Ihre vier Bytes')).toEqual([]);
  });

  it('honours the formal-address allowlist', () => {
    expect(lintGermanCatalog({ k: 'Das Buch „Wie Sie AES verstehen“' }, 'f', { formalAllowlist: ['„Wie Sie AES verstehen“'] })).toEqual([]);
  });

  it('flags "1" with a plural noun and {{count}} misuse', () => {
    expect(lintValue('um 1 Positionen')).toEqual(['error:k:style: "1 Positionen": singular noun needed after 1 (or use a plural key)']);
    expect(lintValue('11 Runden')).toEqual([]);
    expect(lintValue('um {{count}} Positionen', 'k_one')).toEqual(['error:k_one:style: plural noun in a "_one" form']);
    expect(lintValue('um {{count}} Positionen', 'k_other')).toEqual([]);
    expect(lintValue('um {{count}} Positionen')).toEqual(['warning:k:style: {{count}} with a plural noun in a non-plural key; add "_one"/"_other" forms']);
    expect(lintValue('{{count}} Byte')).toEqual([]);
  });

  it('warns about em dashes and three dots', () => {
    expect(lintValue('A — B...')).toEqual(['warning:k:style: em dash; German uses a spaced en dash " – "', 'warning:k:style: three dots; use the ellipsis "…"']);
  });
});

describe('maskMdx', () => {
  it('keeps prose frontmatter and prose attributes, masks code, imports, links and identifiers', () => {
    const source = [
      '---',
      'title: Titel',
      'refs:',
      '  - "Cipher Example"',
      '---',
      "import X from './x';",
      'Text mit `"code"` und [Link](../a/) <Lab labId="x" />',
      '<WhyBox constant="0x63" title="Wert">',
      '{`a  "b"`}',
    ].join('\n');
    const visible = maskMdx(source).replace(/\uE000/g, '').split('\n').map((line) => line.trim());
    expect(visible).toEqual(['', 'Titel', '', '', '', '', 'Text mit  und [Link', 'Wert', '']);
  });
});

describe('lintGermanMdx', () => {
  it('reports the line of each finding and ignores code', () => {
    const source = ['---', 'title: Gut', '---', '', 'Ein Satz mit `"Code"`.', 'Hier steht der Chiffretext.', '<Formula>{`x  "y"`}</Formula>'].join('\n');
    expect(summary(lintGermanMdx(source, 'p.mdx'))).toEqual(['error:line 6:style: "Chiffretext": use "Geheimtext" (glossary: ciphertext)']);
  });

  it('lints prose attributes and frontmatter values', () => {
    const source = ['---', 'title: Das ist z.B. falsch', '---', '<StateGrid caption="Wie Sie sehen, der Chiffretext" kind="ciphertext" />'].join('\n');
    expect(summary(lintGermanMdx(source, 'p.mdx'))).toEqual([
      'error:line 2:style: "z.B." needs a space: "z. B."',
      'error:line 4:style: formal address "Sie" mid-sentence; use the du-form',
      'error:line 4:style: "Chiffretext": use "Geheimtext" (glossary: ciphertext)',
    ]);
  });
});
