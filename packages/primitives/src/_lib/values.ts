import { valueRef, type ValueRef, type ValueRole } from '@cryventure/core';

/** Helpers for `values` facets shared by the producers. */

/** The ValueRef `<ns>.value.<name>` as a one-element list, or none when `bytes` is absent or empty (empty values are omitted). */
export function nonEmptyValueRef(ns: string, name: string, role: ValueRole, bytes: readonly number[] | undefined, createdAt: number): ValueRef[] {
  return bytes === undefined || bytes.length === 0 ? [] : [valueRef(ns, name, role, [...bytes], createdAt)];
}
