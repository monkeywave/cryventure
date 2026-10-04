import { i18nRef, toHex, valueId, type DerivationFacet, type DerivationNode, type LabZoom, type MacFunction } from '@cryventure/core';
import { concatBytes, type PHashChain } from './pHash.ts';
import { prfName, type PrfBlockSteps } from './record.ts';

/**
 * The derivation facet of the TLS PRFs (docs/M7.md §2f): the inputs, label ‖ seed, each P_hash
 * chain A(1) → A(2) → … with its blocks P(i) as results, and the output. Every HMAC node links to
 * the `hmac` lab computing exactly that call when key and message fit the lab.
 */

/** The `hmac` lab's limit for both its key and its message, in bytes (docs/M7.md §2b). */
export const HMAC_LAB_MAX_BYTES = 256;

/** A zoom into the `hmac` lab computing HMAC(key, message) with `mac`'s hash, or `undefined` when `mac` is not an HMAC or the inputs are too long for the lab. */
export function hmacZoom(mac: Pick<MacFunction, 'construction'>, key: Uint8Array, message: Uint8Array): LabZoom | undefined {
  if (mac.construction.kind !== 'hmac' || key.length > HMAC_LAB_MAX_BYTES || message.length > HMAC_LAB_MAX_BYTES) return undefined;
  return {
    producerId: 'hmac',
    params: { hash: mac.construction.hash, key: toHex(key), encoding: 'hex', input: toHex(message), tagLength: 'full', expected: '' },
  };
}

/** One node to add: the label key's last part under `<ns>.derivation.`, and the optional parts. */
export interface PrfNodeSpec {
  id: string;
  label: string;
  labelParams?: Record<string, string | number>;
  bytes: ArrayLike<number>;
  op: string;
  inputs?: string[];
  result?: boolean;
  valueRef?: string;
  step?: number;
  zoom?: LabZoom | undefined;
}

export class PrfDerivationBuilder {
  private readonly nodes: DerivationNode[] = [];

  constructor(private readonly ns: string) {}

  /** Adds a node and returns its id. */
  add(spec: PrfNodeSpec): string {
    const { id, label, labelParams, bytes, op, inputs = [], result, valueRef, step, zoom } = spec;
    this.nodes.push({
      id,
      label: i18nRef(`${this.ns}.derivation.${label}`, labelParams),
      bytes: Array.from(bytes),
      op,
      inputs,
      ...(result === undefined ? {} : { result }),
      ...(valueRef === undefined ? {} : { valueRef }),
      ...(step === undefined ? {} : { step }),
      ...(zoom === undefined ? {} : { zoom }),
    });
    return id;
  }

  /** The facet titled `<ns>.derivation.title`. */
  facet(): DerivationFacet {
    return { kind: 'derivation', schemaVersion: 1, title: i18nRef(`${this.ns}.derivation.title`), nodes: [...this.nodes] };
  }
}

/** One recorded P_hash chain as the derivation needs it. */
export interface PrfChainNodes {
  /** Node-id prefix, e.g. `prf`, `md5`, `sha1`. */
  prefix: string;
  mac: MacFunction;
  key: Uint8Array;
  keyNodeId: string;
  labelSeed: Uint8Array;
  labelSeedNodeId: string;
  chain: PHashChain;
  steps: readonly PrfBlockSteps[];
}

/** Adds A(i) (intermediate) and P(i) (result) per block; returns the P node ids in order. */
export function addChainNodes(builder: PrfDerivationBuilder, spec: PrfChainNodes): string[] {
  const { prefix, mac, key, keyNodeId, labelSeed, labelSeedNodeId, chain, steps } = spec;
  const prf = prfName(mac);
  let previousId = labelSeedNodeId;
  let previous = labelSeed;
  return chain.p.map((p, index) => {
    const a = chain.a[index]!;
    const i = index + 1;
    const aId = builder.add({ id: valueId([prefix, 'a'], String(i)), label: 'a', labelParams: { prf, i }, bytes: a, op: 'hmac', inputs: [previousId, keyNodeId], step: steps[index]?.a, zoom: hmacZoom(mac, key, previous) });
    previousId = aId;
    previous = a;
    const message = concatBytes(a, labelSeed);
    return builder.add({ id: valueId([prefix, 'p'], String(i)), label: 'p', labelParams: { prf, i }, bytes: p, op: 'hmac', inputs: [aId, labelSeedNodeId, keyNodeId], result: true, step: steps[index]?.p, zoom: hmacZoom(mac, key, message) });
  });
}
