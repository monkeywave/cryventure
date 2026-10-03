# Third-party notices

CryVenture bundles or derives from the following third-party works. Runtime npm dependencies are listed
with their licenses by `pnpm licenses list`.

## Patterns / data borrowed (with attribution)
- *(none yet — the illustrated-tls* MIT notices will be added when protocol dissections land in Phase 7)*

## Test vectors and data (shipped as data, with attribution)

### Project Wycheproof — Apache-2.0
- File: `packages/primitives/src/gcm/vectors/wycheproof-aes-gcm.json`, a filtered copy of
  `testvectors_v1/aes_gcm_test.json` from https://github.com/C2SP/wycheproof (commit
  `e0df04e0c033f2d25c5051dd06230336c7822358`). Cases filtered and fields reduced; values unchanged.
- Copyright Google LLC and the C2SP Wycheproof authors. Licensed under the Apache License,
  Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0); see
  https://github.com/C2SP/wycheproof/blob/main/LICENSE. The file's `header` field carries this
  notice and must be kept with it.

### McGrew–Viega GCM test cases (NIST GCM specification)
- File: `packages/primitives/src/gcm/vectors/conformance.json`, test cases 1–18 from D. McGrew and
  J. Viega, "The Galois/Counter Mode of Operation (GCM)", revised spec (May 31, 2005), Appendix B,
  as submitted to NIST (the basis of NIST SP 800-38D). Published test values, reproduced with
  attribution for conformance testing.

### OpenSSL 3.5.9 — Apache-2.0 (facts and citations only)
- The memory/ABI data (`packages/derivers/src/memory/data/`) records layout facts (struct sizes,
  offsets, stored round counts) checked against OpenSSL tag `openssl-3.5.9` (commit
  `45e844fa2a14ec92d146bd8f5778ac130b6625fb`), with file/line citations in
  `packages/derivers/src/memory/data/SOURCES.md`.
- **No OpenSSL code is copied.** OpenSSL is Copyright The OpenSSL Project Authors, licensed under
  the Apache License, Version 2.0 (https://www.openssl.org/source/license.html).

### Compiler-generated listings
- The x86-64 and ARMv8 assembly listings (`packages/derivers/src/isa-x86/data/`,
  `packages/derivers/src/isa-armv8/data/`) and the struct layouts
  (`packages/derivers/src/memory/data/layouts/`) are output of Homebrew clang 23.1.0 compiling
  **our own** sources (`packages/tools/src/asm/aes_x86.c` and `aes_armv8.c` via `pnpm asm:generate`;
  `packages/tools/src/layouts/aes_key.c`, which restates the `AES_KEY` shape from the facts above,
  via `pnpm layouts:generate`). They contain no third-party code; compiler output of our sources is
  covered by this project's license (LLVM's Apache-2.0 WITH LLVM-exception places no terms on it).

## Inspiration only — no code copied
- The Rijndael Animation (Enrique Zabala / formaestudio) — proprietary
- sha256algorithm.com (dmarman) — no license
- Noise Explorer, double-ratchet-vis, elliptic-curve-explorer — GPL-3.0

## Test oracles (dev only, never shipped)
- @noble/ciphers (MIT) — Paul Miller (https://github.com/paulmillr/noble-ciphers). Root dev dependency,
  used only as an independent oracle in unit tests (AES, modes, GCM cross-checks); never bundled.
