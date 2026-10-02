/** Naming helpers shared by the scaffold templates. */
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Plugin ids are lowercase kebab-case starting with a letter, e.g. `demo-xor`. */
export function isKebabCase(id: string): boolean {
  return KEBAB_CASE.test(id);
}

/** `demo-xor` → `DemoXor`. */
export function toPascalCase(id: string): string {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/** `demo-xor` → `demoXor`. */
export function toCamelCase(id: string): string {
  const pascal = toPascalCase(id);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** `demo-xor` → `DEMO_XOR`. */
export function toConstantCase(id: string): string {
  return id.replaceAll('-', '_').toUpperCase();
}
