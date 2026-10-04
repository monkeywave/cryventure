import { hashFunction, portMemberRef, type HashFamily, type MacFamily } from '@cryventure/core';
import { hmacFunction } from './hmac.ts';
import { hmacMemberId } from './manifestKit.ts';

/**
 * A hash producer's `Mac` port value (docs/M7.md §2a): HMAC over each of its `Hash` functions
 * `functionIds`, in that order, as members `hmac-<functionId>` of the family `producerId`.
 */
export function hmacFamily(hashFamily: HashFamily, producerId: string, functionIds: readonly string[]): MacFamily {
  const functions = functionIds.map((functionId) => {
    const hash = hashFunction(hashFamily, functionId);
    if (hash === undefined) throw new Error(`hmacFamily(${producerId}): the Hash family ${hashFamily.id} has no function ${functionId}`);
    return hmacFunction(hash, portMemberRef(producerId, functionId), hmacMemberId(functionId));
  });
  return { id: producerId, functions };
}
