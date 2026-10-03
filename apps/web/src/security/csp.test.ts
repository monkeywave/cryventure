import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildDirectives,
  buildPolicy,
  CSP_DIRECTIVES,
  hashSource,
  HEADER_ONLY_DIRECTIVES,
  renderNginxHeaders,
  SECURITY_HEADERS,
  serializePolicy,
} from './csp';

const NO_HASHES = { scripts: [], styles: [] };

describe('CSP_DIRECTIVES (docs/M4.md §9 target policy)', () => {
  it('never allows inline script or eval beyond WebAssembly', () => {
    expect(CSP_DIRECTIVES['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    const all = Object.values(CSP_DIRECTIVES).flat();
    expect(all).not.toContain("'unsafe-eval'");
  });

  it("allows 'unsafe-inline' only for style attributes (Motion)", () => {
    const withUnsafeInline = Object.entries(CSP_DIRECTIVES)
      .filter(([, sources]) => sources.includes("'unsafe-inline'"))
      .map(([name]) => name);
    expect(withUnsafeInline).toEqual(['style-src-attr']);
  });

  it('locks down plugins, base and forms and keeps fetches same-origin', () => {
    expect(CSP_DIRECTIVES['object-src']).toEqual(["'none'"]);
    expect(CSP_DIRECTIVES['base-uri']).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES['form-action']).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES['connect-src']).toEqual(["'self'"]);
    expect(CSP_DIRECTIVES['worker-src']).toEqual(["'self'", 'blob:']);
    expect(CSP_DIRECTIVES['img-src']).toEqual(["'self'", 'data:', 'blob:']);
  });

  it('keeps meta-ignored directives out of the base set', () => {
    expect(Object.keys(CSP_DIRECTIVES)).not.toContain('frame-ancestors');
    expect(HEADER_ONLY_DIRECTIVES).toEqual({ 'frame-ancestors': ["'none'"] });
  });
});

describe('hashSource', () => {
  it('is the quoted base64 SHA-256 of the UTF-8 body', () => {
    const body = "document.documentElement.dataset.lens = 'ü';";
    const expected = createHash('sha256').update(Buffer.from(body, 'utf8')).digest('base64');
    expect(hashSource(body)).toBe(`'sha256-${expected}'`);
  });

  it('matches a known vector (empty body)', () => {
    expect(hashSource('')).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
  });
});

describe('buildDirectives / buildPolicy', () => {
  const hashes = { scripts: ["'sha256-b'", "'sha256-a'", "'sha256-b'"], styles: ["'sha256-s'"] };

  it('appends sorted, de-duplicated hashes to script-src and style-src', () => {
    const directives = buildDirectives(hashes, 'meta');
    expect(directives['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'", "'sha256-a'", "'sha256-b'"]);
    expect(directives['style-src']).toEqual(["'self'", "'sha256-s'"]);
  });

  it('adds frame-ancestors only for the header', () => {
    expect(buildPolicy(hashes, 'meta')).not.toContain('frame-ancestors');
    expect(buildPolicy(hashes, 'header')).toMatch(/; frame-ancestors 'none'$/);
  });

  it('does not mutate the shared directives', () => {
    buildDirectives(hashes, 'header');
    expect(CSP_DIRECTIVES['script-src']).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it('serialises as "name sources; name sources"', () => {
    expect(serializePolicy({ 'default-src': ["'self'"], 'img-src': ["'self'", 'data:'] })).toBe(
      "default-src 'self'; img-src 'self' data:",
    );
    expect(buildPolicy(NO_HASHES, 'meta')).toMatch(/^default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; /);
  });
});

describe('renderNginxHeaders', () => {
  it('emits one always-on add_header per header, CSP first', () => {
    const conf = renderNginxHeaders("default-src 'self'");
    const lines = conf.split('\n').filter((line) => line.startsWith('add_header'));
    expect(lines[0]).toBe(`add_header Content-Security-Policy "default-src 'self'" always;`);
    expect(lines).toHaveLength(1 + Object.keys(SECURITY_HEADERS).length);
    expect(conf).toContain('add_header X-Content-Type-Options "nosniff" always;');
    expect(conf).toMatch(/^# GENERATED/);
  });
});
