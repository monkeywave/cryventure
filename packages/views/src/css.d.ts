/**
 * Views import their own stylesheet (`import './state.css'`) so Vite bundles it into the view's
 * lazy chunk; Vitest stubs CSS imports. This declares such side-effect imports for TypeScript.
 */
declare module '*.css';
