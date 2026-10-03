import { describe, expect, it } from 'vitest';
import { hashSource } from './csp';
import { collectInlineHashes, injectCspMeta, inlineScriptBodies, inlineStyleBodies, mergeInlineHashes } from './inlineHtml';

const PAGE = [
  '<!doctype html><html><head><meta charset="utf-8"><title>t</title>',
  '<script>a()</script>',
  '<script type="module">b()</script>',
  '<script type="module" src="/_astro/x.js"></script>',
  '<script type="application/ld+json">{"x":1}</script>',
  "<script data-x='1' type='text/javascript'>c()</script>",
  '<style>p{color:red}</style>',
  '</head><body><svg><style>.s{}</style></svg><script>a()</script></body></html>',
].join('');

describe('inlineScriptBodies', () => {
  it('returns executable inline bodies only (no src, no data blocks)', () => {
    expect(inlineScriptBodies(PAGE)).toEqual(['a()', 'b()', 'c()', 'a()']);
  });

  it('normalises CRLF like the HTML parser does', () => {
    expect(inlineScriptBodies('<script>a()\r\nb()\rc()</script>')).toEqual(['a()\nb()\nc()']);
  });

  it('keeps whitespace exactly (it is part of the hash)', () => {
    expect(inlineScriptBodies('<script>\n  x()\n</script>')).toEqual(['\n  x()\n']);
  });

  it('handles uppercase tags and attributes without a src', () => {
    expect(inlineScriptBodies('<SCRIPT data-src-like="1">y()</SCRIPT>')).toEqual(['y()']);
  });
});

describe('quoted ">" inside attributes', () => {
  it('does not end the start tag at a quoted ">" (double and single quotes)', () => {
    expect(inlineScriptBodies('<script data-x="a>b">x()</script>')).toEqual(['x()']);
    expect(inlineScriptBodies("<script data-x='a>b' type=\"module\">y()</script>")).toEqual(['y()']);
  });

  it('still sees a src or data type that follows a quoted ">"', () => {
    expect(inlineScriptBodies('<script data-x="a>b" src="/x.js"></script>')).toEqual([]);
    expect(inlineScriptBodies('<script data-x="a>b" type="application/json">{}</script>')).toEqual([]);
  });

  it('reads src/type as attributes, not as text inside another quoted value', () => {
    expect(inlineScriptBodies('<script data-x="a src=b type=text/plain">z()</script>')).toEqual(['z()']);
  });

  it('applies to <style> start tags and to the <head>/<meta charset> anchors', () => {
    expect(inlineStyleBodies('<style data-x="a>b">p{}</style>')).toEqual(['p{}']);
    expect(injectCspMeta('<head data-x="a>b"><x>', 'p')).toBe(
      '<head data-x="a>b"><meta http-equiv="Content-Security-Policy" content="p"><x>',
    );
    expect(injectCspMeta('<head><meta charset="utf-8" data-x="a>b"><x>', 'p')).toBe(
      '<head><meta charset="utf-8" data-x="a>b"><meta http-equiv="Content-Security-Policy" content="p"><x>',
    );
  });

  it('replaces an earlier CSP meta whose content contains ">"', () => {
    const old = '<head><meta http-equiv="Content-Security-Policy" content="a>b"><x>';
    expect(injectCspMeta(old, 'p')).toBe('<head><meta http-equiv="Content-Security-Policy" content="p"><x>');
  });
});

describe('inlineStyleBodies', () => {
  it('includes styles inside inline SVG', () => {
    expect(inlineStyleBodies(PAGE)).toEqual(['p{color:red}', '.s{}']);
  });

  it('keeps an HTML <style> body raw: entities are not decoded in raw text', () => {
    expect(inlineStyleBodies('<style>a&gt;b{}</style>')).toEqual(['a&gt;b{}']);
    expect(inlineStyleBodies('<svg/><style>a&gt;b{}</style>')).toEqual(['a&gt;b{}']);
    expect(inlineStyleBodies('<svg></svg><style>a&gt;b{}</style>')).toEqual(['a&gt;b{}']);
  });

  // In SVG/MathML the parser decodes entities and CDATA (and parses tags) before the browser hashes
  // the text, so the raw body would hash differently: the build must refuse it, not emit a bad hash.
  it('refuses an SVG <style> with an entity (the browser hashes the decoded text)', () => {
    expect(() => inlineStyleBodies('<svg><style>a&gt;b{}</style></svg>')).toThrow(/inline <style> inside <svg>/);
  });

  it('refuses an SVG <style> with a CDATA section', () => {
    expect(() => inlineStyleBodies('<svg><g><style><![CDATA[a>b{}]]></style></g></svg>')).toThrow(
      /inline <style> inside <svg>/,
    );
  });

  it('refuses a MathML <style> with an entity too', () => {
    expect(() => inlineStyleBodies('<MATH><style>a&amp;b{}</style></MATH>')).toThrow(/inside <math>/);
  });
});

describe('inlineScriptBodies in foreign content', () => {
  it('refuses an SVG <script> whose text the parser would decode', () => {
    expect(() => inlineScriptBodies('<svg><script>a&amp;&amp;b()</script></svg>')).toThrow(
      /inline <script> inside <svg>/,
    );
  });

  it('ignores "<svg" inside a script or comment when deciding the context', () => {
    expect(inlineStyleBodies('<script>"<svg>"</script><!-- <svg> --><style>a&gt;b{}</style>')).toEqual([
      'a&gt;b{}',
    ]);
  });
});

describe('collectInlineHashes / mergeInlineHashes', () => {
  it('hashes each distinct body once', () => {
    const hashes = collectInlineHashes(PAGE);
    expect(hashes.scripts).toEqual(['a()', 'b()', 'c()'].map(hashSource));
    expect(hashes.styles).toEqual(['p{color:red}', '.s{}'].map(hashSource));
  });

  it('unions pages without duplicates', () => {
    const merged = mergeInlineHashes([
      { scripts: ['1', '2'], styles: ['s'] },
      { scripts: ['2', '3'], styles: ['s'] },
    ]);
    expect(merged).toEqual({ scripts: ['1', '2', '3'], styles: ['s'] });
  });
});

describe('injectCspMeta', () => {
  const policy = "script-src 'self' 'sha256-a+b/c='";
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}">`;

  it('places the tag right after the charset meta, before any script', () => {
    const out = injectCspMeta(PAGE, policy);
    expect(out).toContain(`<meta charset="utf-8">${meta}<title>`);
    expect(out.indexOf(meta)).toBeLessThan(out.indexOf('<script'));
  });

  it('falls back to the start of <head> without a charset meta', () => {
    expect(injectCspMeta('<html><head lang="en"><script>x()</script></head></html>', policy)).toBe(
      `<html><head lang="en">${meta}<script>x()</script></head></html>`,
    );
  });

  it('is idempotent: a rerun replaces the earlier tag', () => {
    const once = injectCspMeta(PAGE, "default-src 'none'");
    const twice = injectCspMeta(once, policy);
    expect(twice).toBe(injectCspMeta(PAGE, policy));
    expect(twice.match(/Content-Security-Policy/g)).toHaveLength(1);
  });

  it('escapes attribute-breaking characters', () => {
    expect(injectCspMeta('<head>', 'a"&b')).toBe('<head><meta http-equiv="Content-Security-Policy" content="a&quot;&amp;b">');
  });

  it('refuses a document without <head>', () => {
    expect(() => injectCspMeta('<p>fragment</p>', policy)).toThrow(/no <head>/);
  });
});
