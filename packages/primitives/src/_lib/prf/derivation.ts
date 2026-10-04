import { i18nRef, utf8Bytes, valueId, type DerivationFacet, type DerivationNode, type LabZoom, type MacFunction } from '@cryventure/core';
import { macLabZoom } from '../hmac/labZoom.ts';
import { concatBytes, type PHashChain, type PrfRunInputs } from './pHash.ts';
import { prfName, type PrfBlockSteps } from './record.ts';

/**
 * The derivation facet of the TLS PRFs (docs/M7.md §2f): the inputs, label ‖ seed, each P_hash
 * chain A(1) → A(2) → … with its blocks P(i) as results, and the output. Every HMAC node links to
 * the `hmac` lab computing exactly that call when key and message fit the lab.
 */

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

/** The node ids every TLS PRF derivation starts from. */
export interface PrfInputNodeIds {
  secretId: string;
  labelSeedId: string;
}

/** The input nodes of both TLS PRFs: secret, label and seed, then label ‖ seed at `seedStep`. */
export function addPrfInputNodes(builder: PrfDerivationBuilder, inputs: Omit<PrfRunInputs, 'length'>, seedStep: number): PrfInputNodeIds {
  const secretId = builder.add({ id: 'secret', label: 'secret', bytes: inputs.secret, op: 'input', valueRef: 'secret' });
  const labelId = builder.add({ id: 'label', label: 'label', labelParams: { label: inputs.label }, bytes: utf8Bytes(inputs.label), op: 'input' });
  const seedId = builder.add({ id: 'seed', label: 'seed', bytes: inputs.seed, op: 'input' });
  const labelSeedId = builder.add({ id: 'labelSeed', label: 'labelSeed', bytes: inputs.labelSeed, op: 'concat', inputs: [labelId, seedId], valueRef: 'labelSeed', step: seedStep });
  return { secretId, labelSeedId };
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
    const aId = builder.add({ id: valueId([prefix, 'a'], String(i)), label: 'a', labelParams: { prf, i }, bytes: a, op: 'hmac', inputs: [previousId, keyNodeId], step: steps[index]?.a, zoom: macLabZoom(mac, key, previous) });
    previousId = aId;
    previous = a;
    const message = concatBytes(a, labelSeed);
    return builder.add({ id: valueId([prefix, 'p'], String(i)), label: 'p', labelParams: { prf, i }, bytes: p, op: 'hmac', inputs: [aId, labelSeedNodeId, keyNodeId], result: true, step: steps[index]?.p, zoom: macLabZoom(mac, key, message) });
  });
}
