import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrimitiveManifest } from '@cryventure/core';
import { afterAll } from 'vitest';
import { loadPluginCatalogs } from '../contracts/catalogs.ts';
import { loadConformanceVectors } from '../contracts/conformance.ts';
import { primitiveContract } from '../contracts/primitiveContract.ts';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { scaffold } from './cli.ts';
import { primitiveFolder } from './templates.ts';

/**
 * The scaffolded primitive must pass the full primitive contract as generated: write it into a temp
 * repo (with `@cryventure/core` linked in), load its manifest and register the contract suite on it.
 */
const ID = 'demo-scaffold';
const root = mkdtempSync(join(tmpdir(), 'cv-scaffold-contract-'));
mkdirSync(join(root, 'node_modules', '@cryventure'), { recursive: true });
symlinkSync(join(REPO_ROOT, 'packages', 'core'), join(root, 'node_modules', '@cryventure', 'core'), 'dir');
scaffold({ kind: 'primitive', id: ID, family: 'block-cipher' }, root);

const manifestModule = (await import(join(root, primitiveFolder(ID), 'manifest.ts'))) as { default: PrimitiveManifest };

afterAll(() => rmSync(root, { recursive: true, force: true }));

primitiveContract(manifestModule.default, { catalogs: loadPluginCatalogs('primitives', ID, root), conformance: loadConformanceVectors('primitives', ID, root) });
