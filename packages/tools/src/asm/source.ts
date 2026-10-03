/** Pure helpers over the C sources and the Compiler Explorer link (dev-only, used by `generate.ts`). */

/** The text of `functionName`'s definition in `source`, from its signature line to the matching `}`. */
export function extractCFunction(source: string, functionName: string): string {
  const signature = new RegExp(`^[^\\n;{}]*\\b${functionName}\\s*\\(`, 'm').exec(source);
  if (signature === null) throw new Error(`function ${functionName} not found in C source`);
  const open = source.indexOf('{', signature.index);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(signature.index, index + 1);
  }
  throw new Error(`unbalanced braces in ${functionName}`);
}

/** Everything before the first function definition: comments, includes, the `AES_KEY` typedef. */
export function extractPreamble(source: string, firstFunctionName: string): string {
  const signature = new RegExp(`^[^\\n;{}]*\\b${firstFunctionName}\\s*\\(`, 'm').exec(source);
  if (signature === null) throw new Error(`function ${firstFunctionName} not found in C source`);
  return source.slice(0, signature.index);
}

/**
 * A Compiler Explorer "clientstate" link (base64url JSON in the path) that opens `source` with the
 * given compiler and flags. Link only: nothing ever fetches godbolt.
 *
 * Best effort: the compiler ids (`cclang_trunk`, `armv8-cclang-trunk`) are godbolt's ids for C with
 * clang trunk on x86-64 and AArch64 at the time of writing; godbolt may rename them, and trunk is
 * not the pinned Homebrew clang, so the output there can differ slightly from the committed listing.
 */
export function compilerExplorerUrl(source: string, compilerId: string, flags: string): string {
  const state = {
    sessions: [{ id: 1, language: 'c', source, compilers: [{ id: compilerId, options: flags }] }],
  };
  return `https://godbolt.org/clientstate/${Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')}`;
}
