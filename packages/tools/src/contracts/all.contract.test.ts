import { primitiveManifests } from '@cryventure/primitives';
import { viewManifests } from '@cryventure/views';
import { primitiveContract } from './primitiveContract.ts';
import { viewContract } from './viewContract.ts';

/**
 * Every registered plugin gets the contract suite automatically: the package indexes discover
 * manifests via `import.meta.glob`, so a new plugin folder is covered with zero edits here.
 */
primitiveManifests.forEach((manifest) => primitiveContract(manifest));
viewManifests.forEach((manifest) => viewContract(manifest));
