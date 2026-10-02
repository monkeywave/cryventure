import { fileURLToPath } from 'node:url';

/** Absolute path of the monorepo root (packages/tools/src/fs → ../../../..). */
export const REPO_ROOT: string = fileURLToPath(new URL('../../../../', import.meta.url));
