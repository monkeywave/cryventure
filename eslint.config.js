// @ts-check
import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import boundaries from 'eslint-plugin-boundaries';
import i18next from 'eslint-plugin-i18next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TS_FILES = ['**/*.{ts,tsx,mts,cts}'];
const TEST_FILES = ['**/*.test.{ts,tsx}', '**/*.spec.ts'];
const REACT_FILES = ['packages/viz/**/*.tsx', 'packages/views/**/*.tsx', 'apps/web/**/*.tsx'];
const PLUGIN_FAMILIES = ['primitives', 'protocols', 'derivers', 'views'];
const PACKAGES = ['core', 'primitives', 'protocols', 'derivers', 'viz', 'views', 'tools'];

/**
 * Dependency rule: core <- primitives <- protocols; core <- derivers; core + viz <- views.
 * viz is the React runtime and builds on core only. tools is dev-only and may import anything,
 * so it has no entry here. apps/web composes everything (not covered by these policies).
 */
const ALLOWED_WORKSPACE_DEPS = {
  core: [],
  primitives: ['core'],
  protocols: ['core', 'primitives'],
  derivers: ['core'],
  viz: ['core'],
  views: ['core', 'viz'],
};

const workspaceSource = (name) => `@cryventure/${name}`;
const filesOf = (name) => ({ file: { path: `packages/${name}/**` } });

/**
 * Workspace packages import each other by bare specifier (`@cryventure/core`). The plugin's default
 * node resolver cannot resolve them (package.json `exports` point at .ts sources), so boundaries
 * classifies them as *external* modules whose `module.source` is the package name (subpaths such as
 * `@cryventure/viz/testing` report source `@cryventure/viz`). Policies therefore match workspace
 * packages by `module.source` (hence `checkAllOrigins`) and relative imports by local `element` type.
 * Policies use last-match-wins semantics.
 */
function layerPolicies() {
  return Object.entries(ALLOWED_WORKSPACE_DEPS).flatMap(([layer, allowed]) => {
    const forbiddenPackages = PACKAGES.filter((name) => name !== layer && !allowed.includes(name));
    const message = `'${layer}' may only depend on ${allowed.length ? allowed.map(workspaceSource).join(', ') : 'itself'} (dependency rule). Forbidden: {{dependency.source}}`;
    return [
      {
        from: filesOf(layer),
        disallow: {
          to: [
            { module: { source: forbiddenPackages.map(workspaceSource) } },
            // Relative imports escaping into another package's folder.
            { element: { types: forbiddenPackages } },
            ...(forbiddenPackages.some((name) => PLUGIN_FAMILIES.includes(name))
              ? [{ element: { type: 'plugin', path: forbiddenPackages.map((name) => `packages/${name}/**`) } }]
              : []),
          ],
        },
        message,
      },
    ];
  });
}

/** Plugin folders are isolated: nothing outside a plugin folder reaches into its internals. */
const pluginIsolationPolicies = [
  {
    to: { element: { type: 'plugin' } },
    disallow: { dependency: { kind: '*' } },
    message:
      "Plugin folders must not import another plugin folder's internals ({{dependency.source}}). Go through the package API or core contracts.",
  },
  // Files inside the same plugin folder may import each other.
  { to: { element: { type: 'plugin' } }, allow: { dependency: { relationship: { to: 'internal' } } } },
  // A package's own index (and its tests) may reach plugin manifests, never their implementation.
  {
    from: { element: { types: PLUGIN_FAMILIES } },
    to: { element: { type: 'plugin' }, file: { categories: 'manifest' } },
    allow: { dependency: { kind: '*' } },
  },
];

/**
 * `packages/<family>/src/_lib/` holds code the plugins of one package share (it has no manifest, so
 * the discovery glob skips it). Only that package's plugins (and `_lib` itself) may import it, and
 * `_lib` may import `@cryventure/core` only (the views' `_lib` also React and viz). Manifests may import only their own package's `_lib/applicability.ts` (see manifestPolicies).
 */
const pluginLibPolicies = PLUGIN_FAMILIES.flatMap((family) => [
  {
    to: { element: { type: 'plugin-lib', path: `packages/${family}/**` } },
    disallow: { dependency: { kind: '*' } },
    message: `packages/${family}/src/_lib is shared by the ${family} plugins only ({{dependency.source}}).`,
  },
  {
    from: { element: { types: ['plugin', 'plugin-lib'], path: `packages/${family}/**` } },
    to: { element: { type: 'plugin-lib', path: `packages/${family}/**` } },
    allow: { dependency: { kind: '*' } },
  },
]).concat([
  {
    from: { element: { type: 'plugin-lib' } },
    disallow: { dependency: { kind: '*' } },
    message: '_lib may import only @cryventure/core and its own files (got {{dependency.source}}).',
  },
  { from: { element: { type: 'plugin-lib' } }, allow: { to: { module: { source: workspaceSource('core') } } } },
  { from: { element: { type: 'plugin-lib' } }, allow: { dependency: { relationship: { to: 'internal' } } } },
  // The views' `_lib` holds shared React pieces (e.g. the facet-variant picker), so it may also use
  // what every view uses: React and the viz runtime.
  {
    from: { element: { type: 'plugin-lib', path: 'packages/views/**' } },
    allow: { to: { module: { source: ['react', workspaceSource('viz')] } } },
  },
  // `_lib` tests use the test runner like every other test file.
  { from: { element: { type: 'plugin-lib' }, file: { path: TEST_FILES } }, allow: { to: { module: { source: 'vitest' } } } },
]);

/**
 * A plugin's manifest.ts is loaded eagerly by the registry, so it must stay tiny: it may import
 * `@cryventure/core` only. The implementation is reached via `load: () => import('./module.ts')`,
 * a dynamic import into its own folder that keeps the implementation out of the eager bundle.
 */
const manifestPolicies = [
  {
    from: { element: { type: 'plugin' }, file: { categories: 'manifest' } },
    disallow: { dependency: { kind: '*' } },
    message:
      'manifest.ts may import only @cryventure/core (and its package\'s _lib/applicability.ts); load the implementation lazily via `load: () => import(\'./module.ts\')` (got {{dependency.source}}).',
  },
  {
    from: { element: { type: 'plugin' }, file: { categories: 'manifest' } },
    allow: { to: { module: { source: workspaceSource('core') } } },
  },
  {
    from: { element: { type: 'plugin' }, file: { categories: 'manifest' } },
    allow: { dependency: { nodeKind: 'dynamic-import', relationship: { to: 'internal' } } },
  },
  // A manifest may share tiny, core-only applicability rules (`appliesTo`) through its package's
  // `_lib/applicability.ts`, and nothing else of `_lib` (fixtures and implementation stay lazy).
  ...PLUGIN_FAMILIES.map((family) => ({
    from: { element: { type: 'plugin', path: `packages/${family}/**` }, file: { categories: 'manifest' } },
    allow: {
      to: { element: { type: 'plugin-lib', path: `packages/${family}/**` }, file: { path: '**/_lib/applicability.ts' } },
    },
  })),
  // View manifests type their component with `ViewComponent` from viz. A type-only import is erased
  // at compile time, so it adds nothing to the eager bundle and keeps the manifest contract typed.
  {
    from: { element: { type: 'plugin', path: 'packages/views/**' }, file: { categories: 'manifest' } },
    allow: { to: { module: { source: workspaceSource('viz') } }, dependency: { kind: 'type' } },
  },
];

const boundariesConfig = {
  files: ['packages/**/*.{ts,tsx}'],
  plugins: { boundaries },
  settings: {
    'boundaries/include': ['packages/**/*'],
    'boundaries/elements': [
      // Test-only helpers shared by a package's plugin tests: packages/<pkg>/src/testing/ (not a plugin;
      // listed first because the first matching element wins).
      { type: 'test-support', pattern: 'packages/*/src/testing', partialMatch: false },
      // Shared plugin code: packages/<family>/src/_lib/ (listed before `plugin`, whose pattern also matches it).
      { type: 'plugin-lib', pattern: 'packages/*/src/_lib', capture: ['family'], partialMatch: false },
      // A plugin folder: packages/<family>/src/<id>/ (the package's own src/index.ts is not a plugin).
      ...PLUGIN_FAMILIES.map((family) => ({
        type: 'plugin',
        pattern: `packages/${family}/src/*`,
        capture: ['plugin'],
        partialMatch: false,
      })),
      ...PACKAGES.map((name) => ({ type: name, pattern: `packages/${name}`, partialMatch: false })),
    ],
    'boundaries/files': [{ category: 'manifest', pattern: '**/manifest.ts' }],
  },
  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'allow',
        checkAllOrigins: true,
        checkInternals: true,
        policies: [...pluginIsolationPolicies, ...layerPolicies(), ...pluginLibPolicies, ...manifestPolicies],
      },
    ],
  },
};

const PACKAGE_INTERNALS = {
  group: ['**/packages/**'],
  message: 'apps/web reaches workspace packages through their public exports (@cryventure/<pkg>[/<subpath>] as declared in its package.json exports), never by relative path.',
};

/**
 * apps/web composes the packages through their public API only. Islands run in the browser, so
 * they must not import message catalogs: `Lab.astro` passes exactly one locale's messages as a prop.
 */
const appImportPolicies = [
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [PACKAGE_INTERNALS] }] },
  },
  {
    files: ['apps/web/src/islands/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            PACKAGE_INTERNALS,
            {
              group: ['@cryventure/*/messages', '**/i18n/**/*.json', '**/i18n/loadMessages*', '**/labs/labMessages*'],
              message: 'Islands receive their messages as props (assembled server-side in Lab.astro); importing catalogs would ship every locale to the client.',
            },
          ],
        },
      ],
    },
  },
];

const DETERMINISM_MESSAGE =
  'core, primitives and derivers must be deterministic (traces are replayed and compared). Pass randomness/time in as a parameter.';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.astro/**',
      '**/node_modules/**',
      '**/coverage/**',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: TS_FILES,
    extends: [tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: REACT_FILES,
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['packages/viz/**/*.tsx', 'packages/views/**/*.tsx', 'apps/web/src/islands/**/*.tsx'],
    ignores: TEST_FILES,
    plugins: { i18next },
    rules: { 'i18next/no-literal-string': ['error', { mode: 'jsx-text-only' }] },
  },
  {
    files: ['**/*.ts'],
    ignores: TEST_FILES,
    rules: {
      'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['packages/core/src/**/*.ts', 'packages/primitives/src/**/*.ts', 'packages/derivers/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: `Math.random is banned here. ${DETERMINISM_MESSAGE}`,
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: `Date.now is banned here. ${DETERMINISM_MESSAGE}`,
        },
      ],
    },
  },
  boundariesConfig,
  ...appImportPolicies,
  ...astro.configs.recommended,
  {
    files: TEST_FILES,
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
