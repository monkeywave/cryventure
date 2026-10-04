import { toHex, type LabZoom, type ProducerLookup } from '@cryventure/core';

/**
 * Zoom links from the HMAC lab's inner and outer hash calls into the hash producer's own lab
 * (docs/M7.md §1d): the hash producer's manifest hook `hashLabParams` names its lab params, so this
 * stays free of any hash lab's param names. No link when the producer is unknown, has no hook, or
 * its lab cannot take the message (e.g. longer than its input limit).
 */
export function hashZoom(producers: ProducerLookup, producerId: string, functionId: string, message: readonly number[]): LabZoom | undefined {
  const params = producers.get(producerId)?.hashLabParams?.(functionId, toHex(message));
  return params === undefined ? undefined : { producerId, params };
}
