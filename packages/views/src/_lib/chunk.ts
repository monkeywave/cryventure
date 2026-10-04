/** `items` in consecutive groups of `size` (the last one may be shorter): chunk([1, 2, 3], 2) → [[1, 2], [3]]. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let start = 0; start < items.length; start += size) groups.push(items.slice(start, start + size));
  return groups;
}
