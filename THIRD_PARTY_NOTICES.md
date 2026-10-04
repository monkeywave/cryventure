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
- File: `packages/primitives/src/_lib/hmac/vectors/wycheproof-subset.json`, a filtered copy (94 valid
  cases) of `testvectors_v1/hmac_sha3_{224,256,384,512}_test.json` and
  `hmac_sha512_{224,256}_test.json` from the same repository (`main` branch). Cases filtered and
  fields reduced; values unchanged. Same copyright and license as above; source and filter are
  recorded in the file's `source` / `filter` fields.

### McGrew–Viega GCM test cases (NIST GCM specification)
- File: `packages/primitives/src/gcm/vectors/conformance.json`, test cases 1–18 from D. McGrew and
  J. Viega, "The Galois/Counter Mode of Operation (GCM)", revised spec (May 31, 2005), Appendix B,
  as submitted to NIST (the basis of NIST SP 800-38D). Published test values, reproduced with
  attribution for conformance testing.

### NIST FIPS 180-4 examples and CAVP SHAVS vectors — public domain (US government work)
- Files: `packages/primitives/src/sha256/vectors/` and `packages/primitives/src/sha512/vectors/`
  (`conformance.json`, `cavp-shortmsg.json`), plus intermediate values transcribed into plugin tests.
- `conformance.json`: digests and intermediate values from the NIST CSRC "Examples with
  intermediate values" for FIPS 180-4 (https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines/example-values),
  and the FIPS 180-4 §5.3.6 SHA-512/t IVs. Source URLs are recorded in each file's `source` field.
- `cavp-shortmsg.json`: a filtered copy (messages ≤ 128 bytes) of the CAVP SHAVS byte-oriented
  `SHA{224,256,384,512,512_224,512_256}ShortMsg.rsp`
  (https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/secure-hashing).
  Cases filtered; values unchanged. Source, filter and counts are recorded in the file.
- Works of the US federal government (NIST), not subject to copyright in the United States
  (17 U.S.C. §105). Reproduced with attribution to NIST.

### NIST FIPS 202 / SP 800-185 examples and CAVP SHA-3, SHAKE and SHA-1 vectors — public domain (US government work)
- Files: `packages/primitives/src/sha3/vectors/` (`sha3-nist-examples.json`, `cshake-samples.json`,
  `sha3-cavp-shortmsg.json`, and the NIST cases in `conformance.json`) and
  `packages/primitives/src/sha1/vectors/` (`conformance.json`, `nist-intermediate-abc.json`,
  `cavp-shortmsg.json`).
- `sha3-nist-examples.json`: digests, XOF outputs and intermediate states transcribed from the NIST
  CSRC "Examples with Intermediate Values" PDFs for FIPS 202 (byte-aligned 0- and 1600-bit messages
  only). `cshake-samples.json`: the four NIST SP 800-185 cSHAKE samples (`cSHAKE_samples.pdf`).
- `sha3-cavp-shortmsg.json`: a filtered copy (messages ≤ 200 bytes) of the CAVP SHA-3 and SHAKE
  byte-oriented vectors (CAVS 19.0, `sha-3bytetestvectors.zip`, `shakebytetestvectors.zip`).
  `sha1/cavp-shortmsg.json`: all 65 cases of `SHA1ShortMsg.rsp` (CAVS 11.0,
  `shabytetestvectors.zip`). SHA-1 intermediate values from the NIST `SHA1.pdf` example.
- Cases filtered; values unchanged. Source URLs, zip SHA-256s, filters and counts are recorded in
  each file's `source` / `filter` / `counts` fields.
- Works of the US federal government (NIST), not subject to copyright in the United States
  (17 U.S.C. §105). Reproduced with attribution to NIST.

### RFC 7693 (BLAKE2) and RFC 1321 (MD5) test vectors — IETF Trust
- Files: `packages/primitives/src/blake2/vectors/rfc7693-kat.json` (Appendix A and B examples with
  round states, Appendix E self-test grand hashes and parameters) and the RFC cases in
  `blake2/vectors/conformance.json`; `packages/primitives/src/md5/vectors/conformance.json` (the
  Appendix A.5 test suite, all seven messages) and `md5/vectors/rfc1321-t.json` (the 64 constants
  T[1..64], §3.4 / A.3). Values transcribed unchanged (hex lower-cased / zero-padded).
- RFC text Copyright (c) IETF Trust and the persons identified as the document authors (RFC 7693:
  M-J. Saarinen, J-P. Aumasson; RFC 1321: R. Rivest). Code components are licensed under the
  Revised BSD License per the IETF Trust Legal Provisions (https://trustee.ietf.org/license-info;
  RFC 7693's boilerplate names it the Simplified BSD License). **No RFC code is copied** — only test
  values and constants; RFC 1321's `md5c.c` (RSA Data Security, Inc.) is cited for the T constants,
  not reproduced.

### RFC 2202, 4231, 5869, 6070, 7914 and 8448 test vectors (HMAC, HKDF, PBKDF2) — IETF Trust
- Files: `packages/primitives/src/_lib/hmac/vectors/rfc2202.json` (RFC 2202 §2–§3, HMAC-MD5 and
  HMAC-SHA-1) and `rfc4231.json` (RFC 4231 §4, HMAC-SHA-224/256/384/512 test cases 1–7), with their
  cases in `hmac/vectors/conformance.json`; `packages/primitives/src/hkdf/vectors/conformance.json`
  (RFC 5869 Appendix A, and RFC 8448 §3 handshake values for the TLS 1.3 `HKDF-Expand-Label`
  preview); `packages/primitives/src/pbkdf2/vectors/conformance.json` and `rfc6070-tc4.json`
  (RFC 6070 §2, PBKDF2-HMAC-SHA1; RFC 7914 §11, PBKDF2-HMAC-SHA-256). Values transcribed unchanged
  (hex lower-cased); source URLs are recorded in each file's `source` field.
- RFC text Copyright (c) IETF Trust and the persons identified as the document authors (RFC 2202:
  P. Cheng, R. Glenn; RFC 4231: M. Nystrom; RFC 5869: H. Krawczyk, P. Eronen; RFC 6070:
  S. Josefsson; RFC 7914: C. Percival, S. Josefsson; RFC 8448: M. Thomson). Code components are
  licensed under the Revised BSD License per the IETF Trust Legal Provisions
  (https://trustee.ietf.org/license-info). **No RFC code is copied** — only test values.
- The four TLS 1.2 PRF vectors (P_SHA224/256/384/512) in
  `packages/primitives/src/_lib/prf/vectors/tls-prf-cavp.json` (`kind: prf`) come from J.
  Birr-Pixton, "[TLS] TLS1.2 PRF test vectors", IETF TLS mailing list, 2009-04-22
  (https://mailarchive.ietf.org/arch/msg/tls/fzVCzk-z3FShgGJ6DOXqM1ydxms/), an IETF contribution
  under the IETF Note Well. Published test values, reproduced with attribution.

### NIST CAVP HMAC and SP 800-135 KDF vectors, SP 800-185 KMAC samples — public domain (US government work)
- Files: `packages/primitives/src/_lib/hmac/vectors/cavp-subset.json`, a filtered copy (150 cases,
  SHA-1 and SHA-2) of the CAVP HMACVS `HMAC.rsp` (CAVS 11.0, `hmactestvectors.zip`,
  https://csrc.nist.gov/projects/cryptographic-algorithm-validation-program/message-authentication);
  the CAVP cases (`kind: cavp`) of `packages/primitives/src/_lib/prf/vectors/tls-prf-cavp.json` and
  `tls10-prf/vectors/conformance.json`, `tls12-prf/vectors/conformance.json`, from the SP 800-135
  TLS KDF component vectors (CAVS 12.0, `800-135testvectors/tls.zip`, `tls.rsp`);
  `packages/primitives/src/kmac/vectors/conformance.json`, the NIST SP 800-185 KMAC and KMACXOF
  samples (`KMAC_samples.pdf`, `KMACXOF_samples.pdf`,
  https://csrc.nist.gov/projects/cryptographic-standards-and-guidelines/example-values).
- Cases filtered; values unchanged. Source URLs, filters and counts are recorded in each file's
  `source` / `filter` / `count` fields.
- Works of the US federal government (NIST), not subject to copyright in the United States
  (17 U.S.C. §105). Reproduced with attribution to NIST.

### BLAKE2 reference KATs — CC0 1.0
- Files: the `kat` cases of `packages/primitives/src/blake2/vectors/rfc7693-kat.json` and the keyed
  KAT cases of `blake2/vectors/conformance.json`, a filtered copy (messages ≤ 128 bytes) of
  `testvectors/blake2s-kat.txt` and `blake2b-kat.txt` from https://github.com/BLAKE2/BLAKE2 (commit
  `ed1974ea83433eba7b2d95c5dcd9ac33cb847913`; file SHA-256s recorded in the JSON). Values unchanged.
- By J-P. Aumasson, S. Neves, Z. Wilcox-O'Hearn and C. Winnerlein, dedicated to the public domain
  under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Reproduced with attribution.

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
- The SHA-256 listings (`packages/derivers/src/isa-x86-sha/data/sha256.json`,
  `packages/derivers/src/isa-armv8-sha/data/sha256.json`) are output of the same pinned clang
  compiling **our own** `sha256_compress_block` sources in `packages/tools/src/asm/` (Intel SHA
  extensions and ARMv8 SHA2 intrinsics) via `pnpm asm:generate`. The x86 source follows the
  structure described in Intel's public white paper (Gulley et al., "Intel SHA Extensions", 2013);
  no code is copied from it. Same terms as the AES listings above.
- The ARMv8.2 SHA-512 and SHA-3 listings (`packages/derivers/src/isa-armv8-sha/data/sha512.json`,
  `packages/derivers/src/isa-armv8-sha3/data/keccak.json`) are output of the same pinned clang
  (`-march=armv8.2-a+sha3`) compiling **our own** `sha512_armv8.c` and `keccak_armv8.c` in
  `packages/tools/src/asm/` via `pnpm asm:generate`. `sha512_armv8.c` follows the register
  arrangement described in Linux `arch/arm64/crypto/sha512-ce-core.S` (cited in its header); no code
  is copied from it. The round constants are the published FIPS 180-4 / FIPS 202 values. Same terms
  as the AES listings above.

## Inspiration only — no code copied
- The Rijndael Animation (Enrique Zabala / formaestudio) — proprietary
- sha256algorithm.com (dmarman) — no license
- Noise Explorer, double-ratchet-vis, elliptic-curve-explorer — GPL-3.0

## Test oracles (dev only, never shipped)
- @noble/ciphers (MIT) — Paul Miller (https://github.com/paulmillr/noble-ciphers). Root dev dependency,
  used only as an independent oracle in unit tests (AES, modes, GCM cross-checks); never bundled.
- @noble/hashes (MIT) — Copyright (c) 2022 Paul Miller (https://github.com/paulmillr/noble-hashes).
  Root dev dependency, used only as an independent oracle in unit tests (SHA-224, SHA-256,
  SHA-384, SHA-512, SHA-512/224, SHA-512/256 cross-checks; from M6 also SHA-3, SHAKE, cSHAKE,
  Keccak-256, BLAKE2s/b, MD5 and SHA-1; from M7 also HMAC, HKDF, PBKDF2 and KMAC); never bundled. Some conformance cases are values *computed*
  with it (no code or text copied), marked as such in each file's `source` field
  (`sha3/vectors/keccak-256.json`, the `abc` presets in `sha3/vectors/conformance.json`, the
  non-RFC/non-KAT digests in `blake2/vectors/conformance.json`).
- CPython 3.11.9 `hmac` + `hashlib` (PSF License 2.0; OpenSSL, Apache-2.0) — used once, offline, to
  compute the HMAC long-key cases in `packages/primitives/src/_lib/hmac/vectors/python-oracle.json`
  (keys longer than B for hashes whose standard vectors lack them). Values only, no code copied;
  marked in the file's `source` field. Not a dependency.
