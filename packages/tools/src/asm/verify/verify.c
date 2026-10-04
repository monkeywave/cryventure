/*
 * Native check of the ARMv8.2 SHA512 and SHA3 listing kernels (docs/M6.md §5b): compiles
 * ../sha512_armv8.c and ../keccak_armv8.c for this machine and compares against FIPS vectors and a
 * portable Keccak-f[1600]. Needs FEAT_SHA512 and FEAT_SHA3 (Apple M1 or later). Not run in CI; see
 * README.md.
 */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

void sha512_compress_block(uint64_t state[8], const uint8_t block[128]);
void keccak_f1600(uint64_t A[25]);

static int failures = 0;

static void check(const char *name, int ok) {
    printf("%s %s\n", ok ? "PASS" : "FAIL", name);
    if (!ok) failures += 1;
}

static void print_hex(const char *label, const uint8_t *bytes, size_t length) {
    printf("  %s ", label);
    for (size_t i = 0; i < length; ++i) printf("%02x", bytes[i]);
    printf("\n");
}

/* FIPS 180-4 §5.3.5 IV and SHA-512("abc") (FIPS 180-4 example). */
static void verify_sha512_abc(void) {
    uint64_t state[8] = {
        0x6a09e667f3bcc908, 0xbb67ae8584caa73b, 0x3c6ef372fe94f82b, 0xa54ff53a5f1d36f1,
        0x510e527fade682d1, 0x9b05688c2b3e6c1f, 0x1f83d9abfb41bd6b, 0x5be0cd19137e2179,
    };
    static const uint64_t expected[8] = {
        0xddaf35a193617aba, 0xcc417349ae204131, 0x12e6fa4e89a97ea2, 0x0a9eeee64b55d39a,
        0x2192992a274fc1a8, 0x36ba3c23a3feebbd, 0x454d4423643ce80e, 0x2a9ac94fa54ca49f,
    };
    uint8_t block[128] = {'a', 'b', 'c', 0x80};
    block[127] = 24; /* message length in bits, big-endian 128-bit */
    sha512_compress_block(state, block);
    uint8_t digest[64];
    for (int i = 0; i < 64; ++i) digest[i] = (uint8_t)(state[i / 8] >> (56 - 8 * (i % 8)));
    print_hex("SHA-512(\"abc\")", digest, sizeof digest);
    check("sha512_compress_block: SHA-512(\"abc\")", memcmp(state, expected, sizeof expected) == 0);
}

/* Portable Keccak-f[1600] (FIPS 202 §3.2, A[x + 5y]) as the reference for the whole state. */
static uint64_t rotl(uint64_t value, unsigned shift) {
    return shift == 0 ? value : (value << shift) | (value >> (64 - shift));
}

static void keccak_f1600_reference(uint64_t A[25]) {
    static const unsigned rho[25] = {0,  1,  62, 28, 27, 36, 44, 6,  55, 20, 3,  10, 43,
                                     25, 39, 41, 45, 15, 21, 8,  18, 2,  61, 56, 14};
    uint64_t rc = 0;
    for (int round = 0; round < 24; ++round) {
        uint64_t C[5], B[25];
        for (int x = 0; x < 5; ++x) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
        for (int x = 0; x < 5; ++x)
            for (int y = 0; y < 5; ++y) A[x + 5 * y] ^= C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
        for (int x = 0; x < 5; ++x)
            for (int y = 0; y < 5; ++y)
                B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], rho[x + 5 * y]);
        for (int x = 0; x < 5; ++x)
            for (int y = 0; y < 5; ++y)
                A[x + 5 * y] = B[x + 5 * y] ^ (~B[(x + 1) % 5 + 5 * y] & B[(x + 2) % 5 + 5 * y]);
        /* RC from the LFSR rc(t) (FIPS 202 Algorithm 5), independent of the kernel's table. */
        rc = 0;
        for (int j = 0; j <= 6; ++j) {
            int t = j + 7 * round, r = 1;
            for (int i = 0; i < t % 255; ++i) r = (r << 1) ^ ((r >> 7) & 1 ? 0x71 : 0), r &= 0xff;
            if (r & 1) rc |= (uint64_t)1 << ((1 << j) - 1);
        }
        A[0] ^= rc;
    }
}

static void verify_keccak_states(void) {
    uint64_t A[25] = {0}, R[25] = {0};
    keccak_f1600(A);
    keccak_f1600_reference(R);
    printf("  Keccak-f[1600](0) lane 0 = %016llx\n", (unsigned long long)A[0]);
    check("keccak_f1600(0): lane 0 = f1258f7940e1dde7", A[0] == 0xf1258f7940e1dde7);
    check("keccak_f1600(0): all 25 lanes = portable reference", memcmp(A, R, sizeof A) == 0);
    keccak_f1600(A); /* a second permutation from a non-zero state */
    keccak_f1600_reference(R);
    check("keccak_f1600 twice: all 25 lanes = portable reference", memcmp(A, R, sizeof A) == 0);
}

/* SHA3-256("") with the kernel: rate 136 bytes, pad 0x06 ... 0x80 (FIPS 202 §6.1, B.2). */
static void verify_sha3_256_empty(void) {
    static const uint8_t expected[32] = {
        0xa7, 0xff, 0xc6, 0xf8, 0xbf, 0x1e, 0xd7, 0x66, 0x51, 0xc1, 0x47, 0x56, 0xa0, 0x61, 0xd6, 0x62,
        0xf5, 0x80, 0xff, 0x4d, 0xe4, 0x3b, 0x49, 0xfa, 0x82, 0xd8, 0x0a, 0x4b, 0x80, 0xf8, 0x43, 0x4a,
    };
    uint64_t A[25] = {0};
    uint8_t *bytes = (uint8_t *)A; /* lanes are little-endian on AArch64 */
    bytes[0] ^= 0x06;
    bytes[136 - 1] ^= 0x80;
    keccak_f1600(A);
    print_hex("SHA3-256(\"\")", bytes, 32);
    check("keccak_f1600 sponge: SHA3-256(\"\")", memcmp(bytes, expected, 32) == 0);
}

int main(void) {
    verify_sha512_abc();
    verify_keccak_states();
    verify_sha3_256_empty();
    printf("%s\n", failures == 0 ? "all checks passed" : "CHECKS FAILED");
    return failures == 0 ? 0 : 1;
}
