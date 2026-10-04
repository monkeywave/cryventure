import { i18nRef, type DerivationFacet, type DerivationGroup, type DerivationNode, type LabZoom, type TranslateParams } from '@cryventure/core';

/**
 * The one builder of derivation facets for the HMAC-based producers (hmac, pbkdf2, the TLS PRFs):
 * each node is labelled `<ns>.<prefix>.<label>`, and optional parts are set only when given (the
 * facet omits absent optionals).
 */

/** One node to add: the label key's last part under `<ns>.<prefix>.`, and the optional parts. */
export interface DerivationNodeSpec {
  id: string;
  label: string;
  labelParams?: TranslateParams;
  bytes: ArrayLike<number>;
  op: string;
  inputs?: string[];
  group?: number | undefined;
  result?: boolean | undefined;
  valueRef?: string | undefined;
  step?: number | undefined;
  zoom?: LabZoom | undefined;
}

export class DerivationBuilder {
  private readonly added: DerivationNode[] = [];

  /** `prefix` is the label keys' group under the namespace, `derivation` unless a producer names its nodes elsewhere. */
  constructor(
    private readonly ns: string,
    private readonly prefix = 'derivation',
  ) {}

  /** Adds a node and returns its id. */
  add(spec: DerivationNodeSpec): string {
    const { id, label, labelParams, bytes, op, inputs = [], group, result, valueRef, step, zoom } = spec;
    this.added.push({
      id,
      label: i18nRef(`${this.ns}.${this.prefix}.${label}`, labelParams),
      bytes: Array.from(bytes),
      op,
      inputs,
      ...(group === undefined ? {} : { group }),
      ...(result === undefined ? {} : { result }),
      ...(valueRef === undefined ? {} : { valueRef }),
      ...(step === undefined ? {} : { step }),
      ...(zoom === undefined ? {} : { zoom }),
    });
    return id;
  }

  /** The nodes added so far, in order. */
  get nodes(): DerivationNode[] {
    return [...this.added];
  }

  /** The facet titled `<ns>.<prefix>.title`, with `groups` when given. */
  facet(groups?: DerivationGroup[]): DerivationFacet {
    return { kind: 'derivation', schemaVersion: 1, title: i18nRef(`${this.ns}.${this.prefix}.title`), nodes: this.nodes, ...(groups === undefined ? {} : { groups }) };
  }
}
