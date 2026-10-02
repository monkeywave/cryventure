# @cryventure/primitives

Primitive producer plugins for CryVenture. Each folder `src/<id>/` contributes a `manifest.ts`
(imports `@cryventure/core` only) that `src/index.ts` discovers via
`import.meta.glob('./*/manifest.ts', { eager: true })`; the implementation loads lazily through
`manifest.load()`.

> **Educational implementations — NOT constant-time, NOT for production use.**
> The code favours readability over side-channel resistance: S-box table lookups,
> data-dependent branches in GF(2^8) arithmetic, no key zeroisation. Never use it to
> protect real data.

## `aes` — FIPS 197 (AES-128/192/256)

| File | Content |
|---|---|
| `gf256.ts` | `xtime`, `gmul`, `gpow`, `ginv` (inverse via a^254) |
| `sbox.ts` | `affine`, `sboxEntry = affine ∘ ginv`, derived `SBOX` / `INV_SBOX` |
| `state.ts` | column-major 4×4 state helpers (`cellIndex`, `bytesToState`, …) |
| `ops.ts` | `subBytes`, `shiftRows` (+ `moves`), `mixColumns`, `addRoundKey` and inverses |
| `keyExpansion.ts` | `rotWord`, `subWord`, `rcon`, `expandKey` (Nk = 4/6/8), `roundKeyBytes` |
| `aesTrace.ts` / `steps.ts` | regions (`state`, `roundKey`, `w`), op union, step builders, emitter |
| `cipher.ts` | traced `encryptBlock` / `decryptBlock` (detail `op` or `round`) |
| `module.ts` | `run(params)` → `TraceBundle` (`state`, `values`, `narration` facets); `blockCipher` port |
| `vectors/fips197.json` | FIPS 197 App. A (key expansion), B (per-round states), C.1–C.3 |

Trace shape: op-level steps live in scope `[round, opIndex]` (4·Nr + 3 steps: 43 / 51 / 59);
round-level emits one merged step per round in scope `[round]` (Nr + 1 steps).
