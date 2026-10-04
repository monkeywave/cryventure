/*
 * ARMv8.2 SHA-512 Crypto Extensions: one compression block (AArch64), compiled by
 * packages/tools/src/asm/generate.ts (docs/M6.md §5b). Structure as Linux
 * arch/arm64/crypto/sha512-ce-core.S: state[8] holds a..h (H0..H7) as host-endian 64-bit words;
 * four q registers hold (a,b), (c,d), (e,f), (g,h) and a fifth one rotates in. Each
 * vsha512hq/vsha512h2q pair runs two rounds; su0/su1 compute two schedule words.
 */
#include <stdint.h>
#include <arm_neon.h>

static const uint64_t K[80] = {
    0x428a2f98d728ae22, 0x7137449123ef65cd, 0xb5c0fbcfec4d3b2f, 0xe9b5dba58189dbbc,
    0x3956c25bf348b538, 0x59f111f1b605d019, 0x923f82a4af194f9b, 0xab1c5ed5da6d8118,
    0xd807aa98a3030242, 0x12835b0145706fbe, 0x243185be4ee4b28c, 0x550c7dc3d5ffb4e2,
    0x72be5d74f27b896f, 0x80deb1fe3b1696b1, 0x9bdc06a725c71235, 0xc19bf174cf692694,
    0xe49b69c19ef14ad2, 0xefbe4786384f25e3, 0x0fc19dc68b8cd5b5, 0x240ca1cc77ac9c65,
    0x2de92c6f592b0275, 0x4a7484aa6ea6e483, 0x5cb0a9dcbd41fbd4, 0x76f988da831153b5,
    0x983e5152ee66dfab, 0xa831c66d2db43210, 0xb00327c898fb213f, 0xbf597fc7beef0ee4,
    0xc6e00bf33da88fc2, 0xd5a79147930aa725, 0x06ca6351e003826f, 0x142929670a0e6e70,
    0x27b70a8546d22ffc, 0x2e1b21385c26c926, 0x4d2c6dfc5ac42aed, 0x53380d139d95b3df,
    0x650a73548baf63de, 0x766a0abb3c77b2a8, 0x81c2c92e47edaee6, 0x92722c851482353b,
    0xa2bfe8a14cf10364, 0xa81a664bbc423001, 0xc24b8b70d0f89791, 0xc76c51a30654be30,
    0xd192e819d6ef5218, 0xd69906245565a910, 0xf40e35855771202a, 0x106aa07032bbd1b8,
    0x19a4c116b8d2d0c8, 0x1e376c085141ab53, 0x2748774cdf8eeb99, 0x34b0bcb5e19b48a8,
    0x391c0cb3c5c95a63, 0x4ed8aa4ae3418acb, 0x5b9cca4f7763e373, 0x682e6ff3d6b2b8a3,
    0x748f82ee5defb2fc, 0x78a5636f43172f60, 0x84c87814a1f0ab72, 0x8cc702081a6439ec,
    0x90befffa23631e28, 0xa4506cebde82bde9, 0xbef9a3f7b2c67915, 0xc67178f2e372532b,
    0xca273eceea26619c, 0xd186b8c721c0c207, 0xeada7dd6cde0eb1e, 0xf57d4f7fee6ed178,
    0x06f067aa72176fba, 0x0a637dc5a2c898a6, 0x113f9804bef90dae, 0x1b710b35131c471b,
    0x28db77f523047d84, 0x32caab7b40c72493, 0x3c9ebe0a15c9bebc, 0x431d67c49c100d4c,
    0x4cc5d4becb3e42b6, 0x597f299cfc657e2a, 0x5fcb6fab3ad6faec, 0x6c44198c4a475817,
};

/* W[2g], W[2g+1] from the big-endian block: rev64 swaps the bytes of each word. */
#define LOAD_WORDS(M, g) M = vreinterpretq_u64_u8(vrev64q_u8(vld1q_u8(block + 16 * (g))))

/*
 * Rounds 2r, 2r+1 (sha512-ce-core.S `dround`): S0..S3 hold (a,b), (c,d), (e,f), (g,h), S4 receives
 * the new (e,f) and S3 the new (a,b). M0 = W[2r], W[2r+1].
 */
#define DROUND(S0, S1, S2, S3, S4, r, M0)                              \
    do {                                                               \
        uint64x2_t kw = vaddq_u64(vld1q_u64(K + 2 * (r)), M0);         \
        uint64x2_t fg = vextq_u64(S2, S3, 1);                          \
        uint64x2_t de = vextq_u64(S1, S2, 1);                          \
        S3 = vaddq_u64(S3, vextq_u64(kw, kw, 1));                      \
        S3 = vsha512hq_u64(S3, fg, de);                                \
        S4 = vaddq_u64(S1, S3);                                        \
        S3 = vsha512h2q_u64(S3, S1, S0);                               \
    } while (0)

/* M0 = W[t], W[t+1] becomes W[t+16], W[t+17] (su0: + sigma0, su1: + W[t+9..] + sigma1). */
#define SCHEDULE(M0, M1, M7, M4, M5) \
    M0 = vsha512su1q_u64(vsha512su0q_u64(M0, M1), M7, vextq_u64(M4, M5, 1))

/* Rounds 2r, 2r+1, then the schedule of the words 2r + 16, 2r + 17 into the same register. */
#define DROUND_SCHEDULE(S0, S1, S2, S3, S4, r, M0, M1, M7, M4, M5) \
    DROUND(S0, S1, S2, S3, S4, r, M0);                              \
    SCHEDULE(M0, M1, M7, M4, M5)

/* Five drounds rotate the five state registers once round; eight message registers rotate. */
#define DROUND5_SCHEDULE(r, M0, M1, M2, M3, M4, M5, M6, M7)                     \
    DROUND_SCHEDULE(s0, s1, s2, s3, s4, (r) + 0, M0, M1, M7, M4, M5);           \
    DROUND_SCHEDULE(s3, s0, s4, s2, s1, (r) + 1, M1, M2, M0, M5, M6);           \
    DROUND_SCHEDULE(s2, s3, s1, s4, s0, (r) + 2, M2, M3, M1, M6, M7);           \
    DROUND_SCHEDULE(s4, s2, s0, s1, s3, (r) + 3, M3, M4, M2, M7, M0);           \
    DROUND_SCHEDULE(s1, s4, s3, s0, s2, (r) + 4, M4, M5, M3, M0, M1)

#define DROUND5(r, M0, M1, M2, M3, M4)                  \
    DROUND(s0, s1, s2, s3, s4, (r) + 0, M0);            \
    DROUND(s3, s0, s4, s2, s1, (r) + 1, M1);            \
    DROUND(s2, s3, s1, s4, s0, (r) + 2, M2);            \
    DROUND(s4, s2, s0, s1, s3, (r) + 3, M3);            \
    DROUND(s1, s4, s3, s0, s2, (r) + 4, M4)

void sha512_compress_block(uint64_t state[8], const uint8_t block[128]) {
    uint64x2_t s0 = vld1q_u64(state);     /* a b */
    uint64x2_t s1 = vld1q_u64(state + 2); /* c d */
    uint64x2_t s2 = vld1q_u64(state + 4); /* e f */
    uint64x2_t s3 = vld1q_u64(state + 6); /* g h */
    uint64x2_t s4;
    const uint64x2_t ab_save = s0, cd_save = s1, ef_save = s2, gh_save = s3;
    uint64x2_t m0, m1, m2, m3, m4, m5, m6, m7;
    LOAD_WORDS(m0, 0);
    LOAD_WORDS(m1, 1);
    LOAD_WORDS(m2, 2);
    LOAD_WORDS(m3, 3);
    LOAD_WORDS(m4, 4);
    LOAD_WORDS(m5, 5);
    LOAD_WORDS(m6, 6);
    LOAD_WORDS(m7, 7);
    /* Rounds 0..63 with the schedule (W16..W79), five drounds per state rotation. */
    DROUND5_SCHEDULE(0, m0, m1, m2, m3, m4, m5, m6, m7);
    DROUND5_SCHEDULE(5, m5, m6, m7, m0, m1, m2, m3, m4);
    DROUND5_SCHEDULE(10, m2, m3, m4, m5, m6, m7, m0, m1);
    DROUND5_SCHEDULE(15, m7, m0, m1, m2, m3, m4, m5, m6);
    DROUND5_SCHEDULE(20, m4, m5, m6, m7, m0, m1, m2, m3);
    DROUND5_SCHEDULE(25, m1, m2, m3, m4, m5, m6, m7, m0);
    DROUND_SCHEDULE(s0, s1, s2, s3, s4, 30, m6, m7, m5, m2, m3);
    DROUND_SCHEDULE(s3, s0, s4, s2, s1, 31, m7, m0, m6, m3, m4);
    /* Rounds 64..79: the last sixteen words need no schedule. */
    DROUND(s2, s3, s1, s4, s0, 32, m0);
    DROUND(s4, s2, s0, s1, s3, 33, m1);
    DROUND(s1, s4, s3, s0, s2, 34, m2);
    DROUND5(35, m3, m4, m5, m6, m7);
    vst1q_u64(state, vaddq_u64(s0, ab_save));
    vst1q_u64(state + 2, vaddq_u64(s1, cd_save));
    vst1q_u64(state + 4, vaddq_u64(s2, ef_save));
    vst1q_u64(state + 6, vaddq_u64(s3, gh_save));
}
