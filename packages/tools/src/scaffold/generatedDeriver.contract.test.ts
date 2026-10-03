import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeriverManifest } from '@cryventure/core';
import { afterAll } from 'vitest';
import { loadPluginCatalogs } from '../contracts/catalogs.ts';
import { deriverContract, recordGoldenFixtures } from '../contracts/deriverContract.ts';
import { goldenDir } from '../contracts/deriverGolden.ts';
import { primitiveProducerSet } from '../contracts/runWithPorts.ts';
import { REPO_ROOT } from '../fs/repoRoot.ts';
import { scaffold } from './cli.ts';
import { deriverFolder } from './deriverTemplate.ts';

/**
 * The scaffolded deriver must pass the full deriver contract as generated: write it into a temp
 * repo (with `@cryventure/core` linked in), load its manifest, record its first golden fixture the
 * way an author runs `pnpm golden:update` after scaffolding, and register the contract suite on it.
 */
const ID = 'demo-deriver-scaffold';
const root = mkdtempSync(join(tmpdir(), 'cv-scaffold-deriver-'));
mkdirSync(join(root, 'node_modules', '@cryventure'), { recursive: true });
symlinkSync(join(REPO_ROOT, 'packages', 'core'), join(root, 'node_modules', '@cryventure', 'core'), 'dir');
scaffold({ kind: 'deriver', id: ID, from: ['state'], provides: 'demo-steps' }, root);

const manifestModule = (await import(join(root, deriverFolder(ID), 'manifest.ts'))) as { default: DeriverManifest };

afterAll(() => rmSync(root, { recursive: true, force: true }));

const options = { producers: primitiveProducerSet, catalogs: loadPluginCatalogs('derivers', ID, root), goldenDir: goldenDir(ID, root) };
await recordGoldenFixtures(manifestModule.default, options);

deriverContract(manifestModule.default, { ...options, updateGolden: false });
