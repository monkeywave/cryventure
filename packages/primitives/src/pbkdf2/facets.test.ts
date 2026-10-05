import { isResultNode, validateDerivationFacet, type MacFunction } from '@cryventure/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { blockValueId, DK_ID, PASSWORD_ID, pbkdf2Derivation, pbkdf2Values, SALT_ID, uNodeId } from './facets.ts';
import { recordPbkdf2, type Pbkdf2Recording } from './record.ts';
import { macMember } from '../testing/hmacPorts.ts';

const NS = 'plugin.pbkdf2';
const PASSWORD = [0x70, 0x77];
const SALT = [0x73];
let sha1: MacFunction;

beforeAll(async () => {
  sha1 = await macMember('sha1:hmac-sha-1');
});

function recording(iterations: number, length: number): Pbkdf2Recording {
  return recordPbkdf2({ mac: sha1, password: PASSWORD, salt: SALT, iterations, length });
}

describe('pbkdf2Values', () => {
  it('marks password and DK secret, the salt public, one T per block', () => {
    const values = pbkdf2Values(recording(1, 25), { password: PASSWORD, salt: SALT }).values;
    expect(values.map((value) => [value.id, value.role])).toEqual([
      [PASSWORD_ID, 'secret'],
      [SALT_ID, 'public'],
      [blockValueId(1), 'secret'],
      [blockValueId(2), 'secret'],
      [DK_ID, 'secret'],
    ]);
  });
});

describe('pbkdf2Derivation', () => {
  it('validates and chains S ‖ INT(i) → U₁ → … → T_i → DK', () => {
    const facet = pbkdf2Derivation(recording(3, 25), { mac: sha1, password: PASSWORD, salt: SALT });
    expect(validateDerivationFacet(facet)).toEqual([]);
    expect(facet.title).toEqual({ key: `${NS}.derivation.title` });
    const byId = new Map(facet.nodes.map((node) => [node.id, node]));
    expect(byId.get(uNodeId(1, 1))?.inputs).toEqual(['1/message', PASSWORD_ID]);
    expect(byId.get(uNodeId(1, 3))?.inputs).toEqual([uNodeId(1, 2), PASSWORD_ID]);
    expect(byId.get(blockValueId(1))?.inputs).toEqual([uNodeId(1, 3), uNodeId(1, 1), uNodeId(1, 2)]);
    expect(byId.get(DK_ID)?.inputs).toEqual([blockValueId(1), blockValueId(2)]);
    expect(facet.nodes.filter(isResultNode).map((node) => node.id)).toEqual([blockValueId(1), blockValueId(2), DK_ID]);
    expect(facet.groups?.map((group) => group.id)).toEqual([1, 2]);
  });

  it('zooms on U₁ of every block only', () => {
    const facet = pbkdf2Derivation(recording(3, 25), { mac: sha1, password: PASSWORD, salt: SALT });
    expect(facet.nodes.filter((node) => node.zoom !== undefined).map((node) => [node.id, node.zoom?.params['input']])).toEqual([
      [uNodeId(1, 1), '7300000001'],
      [uNodeId(2, 1), '7300000002'],
    ]);
  });

  it('labels the skipped stretch on U_{c−1} when c > 8', () => {
    const facet = pbkdf2Derivation(recording(20, 20), { mac: sha1, password: PASSWORD, salt: SALT });
    const skipped = facet.nodes.find((node) => node.id === uNodeId(1, 19))!;
    expect(skipped.label).toEqual({ key: `${NS}.derivation.uSkipped`, params: { j: 19, hidden: 16 } });
    expect(skipped.inputs).toEqual([uNodeId(1, 3), PASSWORD_ID]);
    expect(facet.nodes.find((node) => node.id === uNodeId(1, 20))?.inputs).toEqual([uNodeId(1, 19), PASSWORD_ID]);
  });
});
