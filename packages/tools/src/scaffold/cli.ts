import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { parseArgs, type ScaffoldCommand } from './args.ts';
import { primitiveFolder, primitiveTemplate, viewFolder, viewTemplate, type ScaffoldFile } from './templates.ts';

/** Target folder and files for a parsed command (pure). */
export function planScaffold(command: ScaffoldCommand): { folder: string; files: ScaffoldFile[] } {
  if (command.kind === 'primitive') return { folder: primitiveFolder(command.id), files: primitiveTemplate(command.id, command.family) };
  return { folder: viewFolder(command.id), files: viewTemplate(command.id, command.requires) };
}

/** Writes the plugin folder under `root`; refuses to touch an existing folder. Returns written paths. */
export function scaffold(command: ScaffoldCommand, root: string = REPO_ROOT): string[] {
  const { folder, files } = planScaffold(command);
  if (existsSync(join(root, folder))) throw new Error(`${folder} already exists; refusing to overwrite`);
  for (const file of files) {
    mkdirSync(dirname(join(root, file.path)), { recursive: true });
    writeFileSync(join(root, file.path), file.content);
  }
  return files.map((file) => file.path);
}

/** CLI entry: returns the process exit code and reports through `log`/`fail`. */
export function main(args: readonly string[], root: string = REPO_ROOT, log = console.log, fail = console.error): number {
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    fail(parsed.error);
    return 1;
  }
  try {
    scaffold(parsed.command, root).forEach((path) => log(`created ${path}`));
    log('Next: fill in the algorithm, translate the "[DE] " stubs, then run pnpm test && pnpm i18n:check.');
    return 0;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function isEntryPoint(): boolean {
  return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2));
