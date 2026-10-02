/**
 * Tests import the shared stylesheet (`import '../viz.css'`) so jsdom can compute its layout rules
 * (see vitest.config.ts `css.include`). This declares such side-effect imports for TypeScript.
 */
declare module '*.css';
