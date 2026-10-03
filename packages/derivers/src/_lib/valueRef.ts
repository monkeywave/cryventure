/** `item` with `valueRef` attached, or `item` unchanged when there is none (no `valueRef: undefined` key). */
export function withValueRef<T extends object>(
  item: T,
  valueRef: string | undefined,
): T & { valueRef?: string } {
  return valueRef === undefined ? item : { ...item, valueRef };
}
