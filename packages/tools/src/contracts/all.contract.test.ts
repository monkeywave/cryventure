// @vitest-environment jsdom
import '@cryventure/viz/testing/setup';
import { deriverManifests } from '@cryventure/derivers';
import { primitiveManifests } from '@cryventure/primitives';
import { viewManifests } from '@cryventure/views';
import { deriverContract } from './deriverContract.ts';
import { primitiveContract } from './primitiveContract.ts';
import { primitiveProducerSet } from './runWithPorts.ts';
import { viewContract } from './viewContract.ts';

/**
 * Every registered plugin gets the contract suite automatically: the package indexes discover
 * manifests via `import.meta.glob`, so a new plugin folder is covered with zero edits here.
 */
primitiveManifests.forEach((manifest) => primitiveContract(manifest, { producers: primitiveProducerSet }));
viewManifests.forEach((manifest) => viewContract(manifest));
deriverManifests.forEach((manifest) => deriverContract(manifest, { producers: primitiveProducerSet }));
