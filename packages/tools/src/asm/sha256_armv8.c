/*
 * ARMv8 SHA-256 Crypto Extensions: one compression block (AArch64), compiled by
 * packages/tools/src/asm/generate.ts.
 * state[8] holds a..h (H0..H7) as host-endian 32-bit words, like OpenSSL's SHA256_CTX.h.
 * Each vsha256hq/vsha256h2q pair runs four rounds: q ABCD and q EFGH hold the working variables,
 * the third operand holds W[t..t+3] + K[t..t+3]. su0/su1 compute four schedule words.
 */
#include <stdint.h>
#include <arm_neon.h>

static const uint32_t K[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
};

/* W[4g..4g+3] from the big-endian block: rev32 swaps the bytes of each word. */
#define LOAD_WORDS(M, g) M = vreinterpretq_u32_u8(vrev32q_u8(vld1q_u8(block + 16 * (g))))

/* Rounds 4g..4g+3 with M = W[4g..4g+3]. */
#define ROUNDS(M, g)                                   \
    do {                                               \
        uint32x4_t wk = vaddq_u32(M, vld1q_u32(K + 4 * (g))); \
        uint32x4_t abcd = s0;                          \
        s0 = vsha256hq_u32(s0, s1, wk);                \
        s1 = vsha256h2q_u32(s1, abcd, wk);             \
    } while (0)

/* M0 = W[t..t+3] becomes W[t+16..t+19] (su0: + sigma0, su1: + W[t+9..] + sigma1). */
#define SCHEDULE(M0, M1, M2, M3) M0 = vsha256su1q_u32(vsha256su0q_u32(M0, M1), M2, M3)

/* Rounds of group g, then the schedule of group g + 4 into the same register. */
#define ROUNDS_SCHEDULE(M0, M1, M2, M3, g) \
    ROUNDS(M0, g);                         \
    SCHEDULE(M0, M1, M2, M3)

void sha256_compress_block(uint32_t state[8], const uint8_t block[64]) {
    uint32x4_t s0 = vld1q_u32(state);     /* a b c d */
    uint32x4_t s1 = vld1q_u32(state + 4); /* e f g h */
    const uint32x4_t abcd_save = s0, efgh_save = s1;
    uint32x4_t m0, m1, m2, m3;
    LOAD_WORDS(m0, 0);
    LOAD_WORDS(m1, 1);
    LOAD_WORDS(m2, 2);
    LOAD_WORDS(m3, 3);
    ROUNDS_SCHEDULE(m0, m1, m2, m3, 0);
    ROUNDS_SCHEDULE(m1, m2, m3, m0, 1);
    ROUNDS_SCHEDULE(m2, m3, m0, m1, 2);
    ROUNDS_SCHEDULE(m3, m0, m1, m2, 3);
    ROUNDS_SCHEDULE(m0, m1, m2, m3, 4);
    ROUNDS_SCHEDULE(m1, m2, m3, m0, 5);
    ROUNDS_SCHEDULE(m2, m3, m0, m1, 6);
    ROUNDS_SCHEDULE(m3, m0, m1, m2, 7);
    ROUNDS_SCHEDULE(m0, m1, m2, m3, 8);
    ROUNDS_SCHEDULE(m1, m2, m3, m0, 9);
    ROUNDS_SCHEDULE(m2, m3, m0, m1, 10);
    ROUNDS_SCHEDULE(m3, m0, m1, m2, 11);
    ROUNDS(m0, 12);
    ROUNDS(m1, 13);
    ROUNDS(m2, 14);
    ROUNDS(m3, 15);
    vst1q_u32(state, vaddq_u32(s0, abcd_save));
    vst1q_u32(state + 4, vaddq_u32(s1, efgh_save));
}
