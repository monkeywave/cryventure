/*
 * AES-NI block encryption (x86-64), compiled by packages/tools/src/asm/generate.ts.
 * Round keys are read from key->rd_key as 16-byte vectors in raw byte order.
 */
#include <stdint.h>
#include <wmmintrin.h>

/* Unrolled, straight-line code: each function has a fixed round count Nr (10/12/14). */
typedef struct aes_key_st {
    unsigned int rd_key[60];
    int rounds;
} AES_KEY;

void aes_encrypt_block_128(const uint8_t *in, uint8_t *out, const AES_KEY *key) {
    const __m128i *rk = (const __m128i *)key->rd_key;
    __m128i s = _mm_loadu_si128((const __m128i *)in);
    s = _mm_xor_si128(s, _mm_loadu_si128(rk + 0));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 1));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 2));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 3));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 4));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 5));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 6));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 7));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 8));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 9));
    s = _mm_aesenclast_si128(s, _mm_loadu_si128(rk + 10));
    _mm_storeu_si128((__m128i *)out, s);
}

void aes_encrypt_block_192(const uint8_t *in, uint8_t *out, const AES_KEY *key) {
    const __m128i *rk = (const __m128i *)key->rd_key;
    __m128i s = _mm_loadu_si128((const __m128i *)in);
    s = _mm_xor_si128(s, _mm_loadu_si128(rk + 0));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 1));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 2));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 3));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 4));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 5));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 6));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 7));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 8));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 9));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 10));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 11));
    s = _mm_aesenclast_si128(s, _mm_loadu_si128(rk + 12));
    _mm_storeu_si128((__m128i *)out, s);
}

void aes_encrypt_block_256(const uint8_t *in, uint8_t *out, const AES_KEY *key) {
    const __m128i *rk = (const __m128i *)key->rd_key;
    __m128i s = _mm_loadu_si128((const __m128i *)in);
    s = _mm_xor_si128(s, _mm_loadu_si128(rk + 0));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 1));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 2));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 3));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 4));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 5));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 6));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 7));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 8));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 9));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 10));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 11));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 12));
    s = _mm_aesenc_si128(s, _mm_loadu_si128(rk + 13));
    s = _mm_aesenclast_si128(s, _mm_loadu_si128(rk + 14));
    _mm_storeu_si128((__m128i *)out, s);
}
