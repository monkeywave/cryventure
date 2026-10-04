import { getFacet, toHex, type DerivationFacet, type PrimitiveManifest } from '@cryventure/core';
import { describe, expect, it } from 'vitest';
import hkdfManifest from './hkdf/manifest.ts';
import { hmacManifest, type HmacParams } from './hmac/manifest.ts';
import pbkdf2Manifest from './pbkdf2/manifest.ts';
import { portResolverFor } from './testing/hmacPorts.ts';
import tls10PrfManifest from './tls10-prf/manifest.ts';
import tls12PrfManifest from './tls12-prf/manifest.ts';

/** Every zoom of the HMAC-based KDFs into the `hmac` lab (docs/M7.md §1d; built by `_lib/hmac/labZoom.ts`): accepted by the lab unchanged, computing exactly the node. */

/** At most this many PBKDF2 iterations, so the RFC 7914 c = 80000 preset stays out of the unit run. */
const MAX_ITERATIONS = 4096;

const producers = [hkdfManifest, pbkdf2Manifest, tls12PrfManifest, tls10PrfManifest] as PrimitiveManifest[];

function presetsOf(manifest: PrimitiveManifest) {
  return (manifest.presets ?? []).filter((preset) => Number((preset.params as { iterations?: string }).iterations ?? 0) <= MAX_ITERATIONS);
}

describe.each(producers.map((manifest) => ({ id: manifest.id, manifest })))('$id: zooms into the hmac lab', ({ manifest }) => {
  it('links HMAC nodes of every preset to an hmac lab run whose tag is exactly the node bytes', async () => {
    const hmacLab = await hmacManifest.load();
    for (const preset of presetsOf(manifest)) {
      const result = (await manifest.load()).run(preset.params, { resolve: await portResolverFor(manifest, preset.params) });
      if (!result.ok) throw new Error(`${preset.id}: ${result.error.key}`);
      const zoomed = getFacet<DerivationFacet>(result.trace, 'derivation')!.nodes.filter((node) => node.zoom?.producerId === hmacManifest.id);
      expect(zoomed.length, preset.id).toBeGreaterThan(0);
      for (const node of zoomed) {
        const params = node.zoom!.params as unknown as HmacParams;
        expect(hmacManifest.validate(params), `${preset.id} ${node.id}`).toEqual({ ok: true, value: params });
        const lab = hmacLab.run(params, { resolve: await portResolverFor(hmacManifest, params) });
        expect(lab.ok && toHex(lab.trace.output['tag'] ?? []), `${preset.id} ${node.id}`).toBe(toHex(node.bytes));
      }
    }
  }, 60_000);
});
