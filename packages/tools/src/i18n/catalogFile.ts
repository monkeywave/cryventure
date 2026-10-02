import { existsSync, readFileSync } from 'node:fs';
import { flattenCatalog, type FlatCatalog } from './parity.ts';

/** Reads a JSON message catalog as flat dotted keys; a missing file yields an empty catalog. */
export function readCatalogFile(path: string): FlatCatalog {
  return existsSync(path) ? flattenCatalog(JSON.parse(readFileSync(path, 'utf8'))) : {};
}
