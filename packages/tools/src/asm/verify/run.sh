#!/bin/sh
# Compiles the SHA512 and SHA3 listing kernels natively and runs verify.c (see README.md).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
llvm_bin=${CV_LLVM_BIN:-/opt/homebrew/opt/llvm/bin}
clang="$llvm_bin/clang"
objdump="$llvm_bin/llvm-objdump"
flags="-O2 -march=armv8.2-a+sha3 -ffreestanding"
out=$(mktemp -d)
trap 'rm -rf "$out"' EXIT

"$clang" --version | head -n 1

# Instruction words of a function's object code (relocated fields read as zero in both formats).
words() { "$objdump" -d "$1" | awk '/^ *[0-9a-f]+:/ { print $2 }'; }

for kernel in sha512 keccak; do
  source="$here/../${kernel}_armv8.c"
  # The listing's build (ELF, generic tuning) and the native one (Mach-O, tuned generic as well).
  "$clang" -target aarch64-linux-gnu $flags -c "$source" -o "$out/$kernel.elf.o"
  "$clang" -mtune=generic $flags -c "$source" -o "$out/$kernel.o"
  if [ "$(words "$out/$kernel.elf.o")" = "$(words "$out/$kernel.o")" ]; then
    echo "PASS $kernel: native object code = the listing's ($(words "$out/$kernel.o" | wc -l | tr -d ' ') instructions)"
  else
    echo "FAIL $kernel: native object code differs from the listing's" && exit 1
  fi
done

"$clang" -O2 -isysroot "$(xcrun --show-sdk-path)" "$here/verify.c" "$out/sha512.o" "$out/keccak.o" \
  -o "$out/verify"
"$out/verify"
