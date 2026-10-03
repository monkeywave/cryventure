# Memory data: sources

Every claim below was checked against **OpenSSL tag `openssl-3.5.9`** (commit
`45e844fa2a14ec92d146bd8f5778ac130b6625fb`, the 3.5 LTS line), raw files from
`github.com/openssl/openssl` at that tag. Paths are relative to the OpenSSL tree. Checked on 2026-10-03.

## `AES_KEY` layout (`layouts/aes_key.<triple>.json`)

| Claim                                                                        | Path                     | Line  |
| ---------------------------------------------------------------------------- | ------------------------ | ----- |
| `#define AES_MAXNR 14`                                                       | `include/openssl/aes.h`  | 33    |
| `struct aes_key_st { rd_key[4 * (AES_MAXNR + 1)]; int rounds; }`             | `include/openssl/aes.h`  | 36–43 |
| `#ifdef AES_LONG` → `unsigned long rd_key[…]`, else `unsigned int rd_key[…]` | `include/openssl/aes.h`  | 37–41 |
| `u32` is `unsigned long` under `AES_LONG`, else `unsigned int`               | `crypto/aes/aes_local.h` | 37–41 |

- **`AES_LONG` is not defined** for these targets. A full-tree grep at the tag finds it only in
  `#ifdef`s: `include/openssl/aes.h:37`, `crypto/aes/aes_local.h:37` and `include/openssl/seed.h:60`.
  No config defines it. `linux-x86_64` (`Configurations/10-main.conf:886–895`) adds only `-m64` and
  `-DL_ENDIAN`. `linux-aarch64` (`:768–772`) and `linux-generic64` (`:703–706`) add no defines.
- Generated with `pnpm layouts:generate`, using Homebrew clang 23.1.0. Both triples give
  **size 244, align 4**: `rd_key` is `unsigned int[60]` at offset 0 (240 bytes, elemSize 4), and
  `rounds` is `int` at offset 240.
- For comparison, a build with `AES_LONG` defined would give size 488 and align 8 on x86_64, with
  `rounds` at 480.

## Implementations (`impls.json`)

| impl    | `rounds` stored (128/192/256) | Evidence                                                                                                                                           | `rd_key` bytes                                                        |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `c-ref` | 10 / 12 / 14                  | `crypto/aes/aes_core.c:3061/3063/3065`                                                                                                             | host-endian u32 (`GETU32`, `aes_core.c:3067`, macro `aes_local.h:26`) |
| `aesni` | **9 / 11 / 13**               | `crypto/aes/asm/aesni-x86_64.pl:4394/4494/4564`; stored at `240(key)` (`:4420`, plus `:4487`, `:4516`, `:4557`, `:4598`, `:4652` on the alt paths) | raw bytes (`movups`, `:4382`, `:4398`)                                |
| `armv8` | 10 / 12 / 14                  | `crypto/aes/asm/aesv8-armx.pl:219/258/266`; `str` at key+240 (`:301`)                                                                              | raw bytes (`vld1.8` `:162`, `vst1.32` `:174`)                         |

- **aesni stores rounds − 1.** M4.md §4 expected 9/11/13, and that is confirmed. Its readers use
  the value as the `aesenc` loop count, then add one `aesenclast` (`aesni-x86_64.pl:263–267`).
  `aesni_set_decrypt_key` documents it as "rounds-1" (`:4304`, `:4357`). The store is 32-bit,
  because `$bits` is rewritten to `%e..` at `:4293`.
- **armv8:** M4.md §4 expected 10/12/14, and that is confirmed.
- **No contradictions with M4.md §4.** Two caveats belong in the lesson text:
  1. **c-ref on x86_64 means a `no-asm` build.** With asm enabled, x86_64 does not compile
     `aes_core.c`, and `AES_set_encrypt_key` comes from `aes-x86_64.pl`
     (`crypto/aes/build.info:10–14`). aarch64 does compile `aes_core.c`, without `AES_ASM`
     (`build.info:34–35`), so the `aes_core.c:3045` variant is the real C fallback there.
  2. The opt-in `OPENSSL_AES_CONST_TIME` variant (`aes_core.c:53`, `:631`) writes the schedule
     through a `u64 *`. It is not modelled.
- ARMv8 dispatch: `HWAES_set_encrypt_key` is `aes_v8_set_encrypt_key`
  (`include/crypto/aes_platform.h:106`).
- On these little-endian targets, `host-endian-u32` means each 4-byte word appears byte-reversed
  in RAM. For example, the FIPS 197 key `2b7e1516…` becomes `16 15 7e 2b …`. `raw-bytes` stores
  the key bytes as-is (`2b 7e 15 16 …`).

## Targets (`targets.json`)

LP64, `ptrSize` 8 and little-endian are standard for both Linux ABIs. The `stack.frameBase`
addresses (`0x7ffc5e3a1000` on x86_64, `0xffffd2c4f000` on aarch64) are **modeled**. They are
chosen to look like typical user-stack ranges and are not recorded from a real process.
