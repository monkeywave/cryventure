import type { FieldFacet } from '@cryventure/core';

/**
 * The notation of every GF(2¹²⁸) field facet the primitives emit (GHASH, GCM): the field, its
 * reduction polynomial and GCM's reflected bit order (SP 800-38D §6.3). Shared here because core is
 * frozen (docs/M4.md §0) and plugins may not import each other.
 */
export const GF128_FIELD_NOTATION: FieldFacet['notation'] = Object.freeze({ field: 'gf2^128', modulus: 'x^128+x^7+x^2+x+1', bitOrder: 'gcm-reflected' });
