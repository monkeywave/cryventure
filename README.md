# CryVenture — Explore cryptography. Build understanding.

An interactive, animation-driven learning platform for cryptography: symmetric ciphers and modes,
hashes/PRF/HKDF internals, Diffie–Hellman in all its variants, post-quantum cryptography and real
protocols (TLS, SSH, WireGuard, Signal, …) — with step-by-step internal state, memory/ABI views and
hardware context. Available in **English** and **German**.

> ⚠️ Educational implementations only. Never use CryVenture code to protect real data.

## Run it

| Way | Command |
|---|---|
| Local dev | `pnpm install && pnpm dev` |
| Static build | `pnpm build && pnpm preview` |
| Docker | `docker run --rm -p 8080:8080 ghcr.io/<owner>/cryventure` → http://localhost:8080/ |
| Docker (local build) | `docker compose -f docker/compose.yaml up --build` |
| GitHub Pages | push to `main` — `.github/workflows/pages.yml` deploys to `https://<owner>.github.io/cryventure/` |

Base path is configurable via `CV_BASE` (default `/`) and `CV_SITE`.

## Architecture in one picture

```
Producer plugins ──► Facets (state, values, narration, instructions, memory, packets, …) ──► View plugins
(primitives, protocols,         typed, versioned, shared timeline + ValueRefs             (auto-discovered by
 recorded-trace importers)                                                                 required facets)
```

| Package | Role |
|---|---|
| `packages/core` | contracts: TraceBundle, facets, tracers, registries — no DOM, no deps |
| `packages/primitives` | algorithm plugins (one folder each, e.g. `aes/`) |
| `packages/viz` | React runtime: lab store, player, workspace, byte grids |
| `packages/views` | view plugins (one folder each, e.g. `state/`, `narration/`) |
| `packages/tools` | contract-test kit, scaffolder, i18n parity, test oracles |
| `apps/web` | Astro + Starlight site (EN/DE) |

Add a plugin: `pnpm cv new primitive <id>` or `pnpm cv new view <id> --requires state`.
See `docs/PLAN.md` for the full roadmap and `docs/STATUS.md` for current progress and next steps.

## Quality gates
`pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test && pnpm e2e`

## License
Code: Apache-2.0 (`LICENSE`). Content: CC BY 4.0 (`LICENSE-CONTENT.md`). See `THIRD_PARTY_NOTICES.md`.
