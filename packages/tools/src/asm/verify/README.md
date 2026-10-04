# Native verification of the ARMv8.2 SHA512 / SHA3 listings

Dev-only, never run in CI (docs/M6.md §5b). It needs an AArch64 Mac with FEAT_SHA512 and FEAT_SHA3
(Apple M1 or later: `sysctl hw.optional.arm.FEAT_SHA512 hw.optional.arm.FEAT_SHA3`) and the pinned
LLVM (`/opt/homebrew/opt/llvm/bin`, or `CV_LLVM_BIN`).

```sh
packages/tools/src/asm/verify/run.sh
```

What it checks:

1. **Same code as the listing.** Each kernel (`../sha512_armv8.c`, `../keccak_armv8.c`) is compiled
   twice with the listing flags (`-O2 -march=armv8.2-a+sha3 -ffreestanding`): for
   `aarch64-linux-gnu` (what `pnpm asm:generate` lists) and natively with `-mtune=generic` (the
   macOS default tuning is `apple-m1`, which schedules differently). The instruction words must be
   identical, so the native run executes exactly the listed instructions.
2. **`sha512_compress_block`** on the padded `"abc"` block from the SHA-512 IV gives the FIPS 180-4
   SHA-512("abc") state `ddaf35a1…a54ca49f`.
3. **`keccak_f1600`** on the zero state gives lane 0 = `f1258f7940e1dde7` and all 25 lanes equal a
   portable C Keccak-f[1600] in `verify.c` (whose RC comes from the FIPS 202 LFSR, not the kernel's
   table); a second permutation from that non-zero state matches too.
4. **SHA3-256("")** via a one-block sponge around `keccak_f1600` (rate 136, pad `0x06 … 0x80`) is
   `a7ffc6f8…80f8434a`.

It prints `PASS`/`FAIL` per check and exits non-zero on any failure.
