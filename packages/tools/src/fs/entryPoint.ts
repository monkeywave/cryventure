import { pathToFileURL } from 'node:url';

/** Whether the module at `moduleUrl` (pass `import.meta.url`) is the script node was started with. */
export function isEntryPoint(moduleUrl: string, scriptPath: string | undefined = process.argv[1]): boolean {
  return scriptPath !== undefined && moduleUrl === pathToFileURL(scriptPath).href;
}
