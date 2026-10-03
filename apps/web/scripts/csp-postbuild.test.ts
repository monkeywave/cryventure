import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildPolicy, hashSource } from '../src/security/csp';
import {
  findHtmlFiles,
  nodePostbuildFs,
  parseCliArgs,
  runCspPostbuild,
  writeHeaderInclude,
  writePageMetas,
  type PostbuildFs,
} from './csp-postbuild';

/** In-memory fs: paths are plain keys; `listFiles` returns every key under `dir`. */
function memoryFs(initial: Record<string, string>): PostbuildFs & { files: Map<string, string>; dirs: string[] } {
  const files = new Map(Object.entries(initial));
  const dirs: string[] = [];
  return {
    files,
    dirs,
    listFiles: async (dir) => [...files.keys()].filter((path) => path.startsWith(`${dir}/`)),
    readFile: async (path) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`ENOENT ${path}`);
      return content;
    },
    writeFile: async (path, content) => void files.set(path, content),
    mkdir: async (dir) => void dirs.push(dir),
  };
}

const PAGE = '<html><head><meta charset="utf-8"><script>a()</script></head><body></body></html>';
const OTHER = '<html><head><script>b()</script><style>p{}</style></head></html>';

describe('findHtmlFiles (walk dist)', () => {
  it('keeps only .html files, recursively', async () => {
    const fs = memoryFs({ '/d/index.html': '', '/d/en/x/index.html': '', '/d/a.js': '', '/d/x.htm': '', '/e/o.html': '' });
    expect((await findHtmlFiles(fs, '/d')).sort()).toEqual(['/d/en/x/index.html', '/d/index.html']);
  });

  describe('with the real node fs', () => {
    let dir = '';
    afterEach(async () => {
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    it('walks nested directories', async () => {
      dir = await mkdtemp(join(tmpdir(), 'csp-walk-'));
      await mkdir(join(dir, 'en', 'deep'), { recursive: true });
      await writeFile(join(dir, 'index.html'), '');
      await writeFile(join(dir, 'en', 'deep', 'index.html'), '');
      await writeFile(join(dir, 'en', 'app.js'), '');
      expect((await findHtmlFiles(nodePostbuildFs, dir)).sort()).toEqual(
        [join(dir, 'en', 'deep', 'index.html'), join(dir, 'index.html')].sort(),
      );
    });
  });
});

describe('writePageMetas (write meta)', () => {
  it('writes each page its own policy and returns its hashes', async () => {
    const fs = memoryFs({ '/d/a.html': PAGE, '/d/b.html': OTHER });
    const hashes = await writePageMetas(fs, ['/d/a.html', '/d/b.html']);
    expect(hashes).toEqual([
      { scripts: [hashSource('a()')], styles: [] },
      { scripts: [hashSource('b()')], styles: [hashSource('p{}')] },
    ]);
    const policyA = buildPolicy({ scripts: [hashSource('a()')], styles: [] }, 'meta');
    expect(fs.files.get('/d/a.html')).toContain(`<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policyA}">`);
    expect(fs.files.get('/d/b.html')).not.toContain(hashSource('a()'));
  });
});

describe('writeHeaderInclude (write header)', () => {
  it('creates the directory and writes the union of all hashes with header-only directives', async () => {
    const fs = memoryFs({});
    const union = await writeHeaderInclude(fs, '/out/gen/security-headers.conf', [
      { scripts: ['s1', 's2'], styles: [] },
      { scripts: ['s2'], styles: ['t1'] },
    ]);
    expect(union).toEqual({ scripts: ['s1', 's2'], styles: ['t1'] });
    expect(fs.dirs).toEqual(['/out/gen']);
    const conf = fs.files.get('/out/gen/security-headers.conf') ?? '';
    expect(conf).toContain(`add_header Content-Security-Policy "${buildPolicy(union, 'header')}" always;`);
    expect(conf).toContain("frame-ancestors 'none'");
  });
});

describe('runCspPostbuild', () => {
  it('processes every page of the given dist dir and summarises', async () => {
    const fs = memoryFs({ '/d/a.html': PAGE, '/d/b.html': OTHER });
    const summary = await runCspPostbuild({ fs, distDir: '/d', headersFile: '/h/s.conf' });
    expect(summary).toEqual({ pages: 2, scriptHashes: 2, styleHashes: 1 });
    expect(fs.files.get('/h/s.conf')).toContain(hashSource('b()'));
  });
});

describe('parseCliArgs', () => {
  const defaults = { distDir: '/repo/apps/web/dist', headersFile: '/repo/docker/generated/security-headers.conf' };

  it('uses the defaults without arguments', () => {
    expect(parseCliArgs([], defaults)).toEqual(defaults);
  });

  it('takes a dist dir and an optional headers file (resolved)', () => {
    expect(parseCliArgs(['/tmp/x/dist'], defaults)).toEqual({ ...defaults, distDir: '/tmp/x/dist' });
    expect(parseCliArgs(['/tmp/x/dist', '--headers', '/tmp/x/h.conf'], defaults)).toEqual({
      distDir: '/tmp/x/dist',
      headersFile: '/tmp/x/h.conf',
    });
  });

  it('rejects unknown flags', () => {
    expect(() => parseCliArgs(['--nope'], defaults)).toThrow(/usage/);
  });
});
