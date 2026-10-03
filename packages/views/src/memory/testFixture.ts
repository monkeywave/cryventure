import type { MemoryFacet, Messages, TraceBundle } from '@cryventure/core';
import { tickBundle } from '../testing/tickBundle.ts';
import fixture from './fixtures/aes128-memory.json';

/**
 * Test-only: the memory facets the memory deriver (`derivers/src/memory`) derives from the FIPS 197
 * C.1 AES-128 bundle (all four `<triple>+<impl>` variants). Views may not import derivers, hence
 * the JSON snapshot.
 */
export const memoryFacets = fixture.facets as unknown as Record<string, MemoryFacet>;
export const memoryStepCount = fixture.stepCount;

export const X86_CREF = 'memory@x86_64-c-ref';
export const X86_AESNI = 'memory@x86_64-aesni';
export const ARM_CREF = 'memory@aarch64-c-ref';
export const ARM_ARMV8 = 'memory@aarch64-armv8-ce';

/** State step of `AES_set_encrypt_key` (the key writes) and of the output write. */
export const KEY_STEP = memoryFacets[X86_CREF]!.writes[1]!.align.last;
export const OUTPUT_STEP = memoryFacets[X86_CREF]!.writes.at(-1)!.align.last;

/** A deep copy of one fixture facet, safe to mutate in a test. */
export function memoryFacet(key: string): MemoryFacet {
  return JSON.parse(JSON.stringify(memoryFacets[key])) as MemoryFacet;
}

/** A bundle with the derived memory facets (as bundle facets) and an empty-write state facet so the playhead can move. */
export function memoryBundle(facets: Record<string, MemoryFacet> = memoryFacets): TraceBundle {
  return tickBundle('aes', memoryStepCount, JSON.parse(JSON.stringify(facets)));
}

/** Deriver labels the view renders (normally from the memory deriver's catalog). */
export const deriverLabels: Record<'en' | 'de', Messages> = {
  en: {
    'deriver.memory.variant.x86_64-linux-gnu.c-ref': 'x86-64 Linux · OpenSSL C reference',
    'deriver.memory.variant.x86_64-linux-gnu.aesni': 'x86-64 Linux · OpenSSL AES-NI',
    'deriver.memory.variant.aarch64-linux-gnu.c-ref': 'AArch64 Linux · OpenSSL C reference',
    'deriver.memory.variant.aarch64-linux-gnu.armv8': 'AArch64 Linux · OpenSSL ARMv8',
    'deriver.memory.impl.c-ref': 'OpenSSL C reference',
    'deriver.memory.impl.aesni': 'OpenSSL AES-NI',
    'deriver.memory.impl.armv8': 'OpenSSL ARMv8',
    'deriver.memory.allocation.in': 'in – plaintext buffer',
    'deriver.memory.allocation.out': 'out – ciphertext buffer',
    'deriver.memory.allocation.key': 'key – expanded key (AES_KEY)',
  },
  de: {
    'deriver.memory.variant.x86_64-linux-gnu.c-ref': 'x86-64 Linux · OpenSSL-C-Referenz',
    'deriver.memory.variant.x86_64-linux-gnu.aesni': 'x86-64 Linux · OpenSSL AES-NI',
    'deriver.memory.variant.aarch64-linux-gnu.c-ref': 'AArch64 Linux · OpenSSL-C-Referenz',
    'deriver.memory.variant.aarch64-linux-gnu.armv8': 'AArch64 Linux · OpenSSL ARMv8',
    'deriver.memory.impl.c-ref': 'OpenSSL-C-Referenz',
    'deriver.memory.impl.aesni': 'OpenSSL AES-NI',
    'deriver.memory.impl.armv8': 'OpenSSL ARMv8',
    'deriver.memory.allocation.in': 'in – Klartextpuffer',
    'deriver.memory.allocation.out': 'out – Geheimtextpuffer',
    'deriver.memory.allocation.key': 'key – expandierter Schlüssel (AES_KEY)',
  },
};
