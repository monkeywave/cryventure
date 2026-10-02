import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Absolute path of the monorepo root (packages/tools/src/fs → ../../../..), with a trailing separator.
 * Resolved from the file path, not `new URL`, so it also works where a DOM test environment replaces `URL`.
 */
export const REPO_ROOT: string = `${resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')}/`;
