/*
 * Intel SHA Extensions: one SHA-256 compression block (x86-64), compiled by
 * packages/tools/src/asm/generate.ts. Structure after Gulley et al., "Intel SHA Extensions" (2013).
 * state[8] holds a..h (H0..H7) as host-endian 32-bit words, like OpenSSL's SHA256_CTX.h.
 * sha256rnds2 runs two rounds on the packed state ABEF/CDGH with W[t..t+1] + K[t..t+1] in the low
 * half of xmm0; pshufd 0x0E moves W+K for rounds t+2, t+3 down for the second sha256rnds2.
 */
#include <stdint.h>
#include <immintrin.h>

static const uint32_t K[64] __attribute__((aligned(16))) = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
};

/* W[4g..4g+3] from the big-endian block: pshufb swaps the bytes of each word. */
#define LOAD_WORDS(M, g) M = _mm_shuffle_epi8(_mm_loadu_si128((const __m128i *)(block + 16 * (g))), byte_swap)

/* Rounds 4g..4g+3 with M = W[4g..4g+3]: two sha256rnds2, W+K in xmm0. */
#define ROUNDS(M, g)                                                           \
    do {                                                                       \
        __m128i wk = _mm_add_epi32(M, _mm_load_si128((const __m128i *)(K + 4 * (g)))); \
        cdgh = _mm_sha256rnds2_epu32(cdgh, abef, wk);                          \
        wk = _mm_shuffle_epi32(wk, 0x0E);                                      \
        abef = _mm_sha256rnds2_epu32(abef, cdgh, wk);                          \
    } while (0)

/* Mn holds msg1's W[t..t+3] + sigma0(W[t+1..t+4]); add W[t+9..t+12], then msg2 adds sigma1. */
#define MSG2(Mn, Mprev, Mprev2) \
    Mn = _mm_sha256msg2_epu32(_mm_add_epi32(Mn, _mm_alignr_epi8(Mprev, Mprev2, 4)), Mprev)

/* W[t..t+3] + sigma0(W[t+1..t+4]): the first half of W[t+16..t+19]. */
#define MSG1(M0, M1) M0 = _mm_sha256msg1_epu32(M0, M1)

void sha256_compress_block(uint32_t state[8], const uint8_t block[64]) {
    const __m128i byte_swap = _mm_set_epi64x(0x0c0d0e0f08090a0bULL, 0x0405060700010203ULL);
    /* Pack a..h into ABEF / CDGH (lane 3 = most significant). */
    __m128i dcba = _mm_loadu_si128((const __m128i *)state);
    __m128i hgfe = _mm_loadu_si128((const __m128i *)(state + 4));
    __m128i cdab = _mm_shuffle_epi32(dcba, 0xB1);
    __m128i efgh = _mm_shuffle_epi32(hgfe, 0x1B);
    __m128i abef = _mm_alignr_epi8(cdab, efgh, 8);
    __m128i cdgh = _mm_blend_epi16(efgh, cdab, 0xF0);
    const __m128i abef_save = abef, cdgh_save = cdgh;
    __m128i m0, m1, m2, m3;

    LOAD_WORDS(m0, 0);
    ROUNDS(m0, 0);
    LOAD_WORDS(m1, 1);
    ROUNDS(m1, 1);
    MSG1(m0, m1);                     /* W16..19 */
    LOAD_WORDS(m2, 2);
    ROUNDS(m2, 2);
    MSG1(m1, m2);                     /* W20..23 */
    LOAD_WORDS(m3, 3);
    ROUNDS(m3, 3);
    MSG2(m0, m3, m2); MSG1(m2, m3);   /* W16..19 done; W24..27 */
    ROUNDS(m0, 4);
    MSG2(m1, m0, m3); MSG1(m3, m0);   /* W20..23; W28..31 */
    ROUNDS(m1, 5);
    MSG2(m2, m1, m0); MSG1(m0, m1);   /* W24..27; W32..35 */
    ROUNDS(m2, 6);
    MSG2(m3, m2, m1); MSG1(m1, m2);   /* W28..31; W36..39 */
    ROUNDS(m3, 7);
    MSG2(m0, m3, m2); MSG1(m2, m3);   /* W32..35; W40..43 */
    ROUNDS(m0, 8);
    MSG2(m1, m0, m3); MSG1(m3, m0);   /* W36..39; W44..47 */
    ROUNDS(m1, 9);
    MSG2(m2, m1, m0); MSG1(m0, m1);   /* W40..43; W48..51 */
    ROUNDS(m2, 10);
    MSG2(m3, m2, m1); MSG1(m1, m2);   /* W44..47; W52..55 */
    ROUNDS(m3, 11);
    MSG2(m0, m3, m2); MSG1(m2, m3);   /* W48..51; W56..59 */
    ROUNDS(m0, 12);
    MSG2(m1, m0, m3); MSG1(m3, m0);   /* W52..55; W60..63 */
    ROUNDS(m1, 13);
    MSG2(m2, m1, m0);                 /* W56..59 */
    ROUNDS(m2, 14);
    MSG2(m3, m2, m1);                 /* W60..63 */
    ROUNDS(m3, 15);

    /* Feed forward, then unpack ABEF / CDGH back to a..h. */
    abef = _mm_add_epi32(abef, abef_save);
    cdgh = _mm_add_epi32(cdgh, cdgh_save);
    __m128i feba = _mm_shuffle_epi32(abef, 0x1B);
    __m128i dchg = _mm_shuffle_epi32(cdgh, 0xB1);
    _mm_storeu_si128((__m128i *)state, _mm_blend_epi16(feba, dchg, 0xF0));
    _mm_storeu_si128((__m128i *)(state + 4), _mm_alignr_epi8(dchg, feba, 8));
}
