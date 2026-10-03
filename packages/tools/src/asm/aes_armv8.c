/*
 * ARMv8 Crypto Extensions block encryption (AArch64), compiled by packages/tools/src/asm/generate.ts.
 * Round keys are read from key->rd_key as 16-byte vectors in raw byte order.
 * aese(s, k) = SubBytes(ShiftRows(s ^ k)); aesmc = MixColumns.
 */
#include <stdint.h>
#include <arm_neon.h>

/* Unrolled, straight-line code: each function has a fixed round count Nr (10/12/14). */
typedef struct aes_key_st {
    unsigned int rd_key[60];
    int rounds;
} AES_KEY;

void aes_encrypt_block_128(const uint8_t *in, uint8_t *out, const AES_KEY *key) {
    const uint8_t *rk = (const uint8_t *)key->rd_key;
    uint8x16_t s = vld1q_u8(in);
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 0 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 1 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 2 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 3 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 4 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 5 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 6 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 7 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 8 * 16)));
    s = vaeseq_u8(s, vld1q_u8(rk + 9 * 16));
    s = veorq_u8(s, vld1q_u8(rk + 10 * 16));
    vst1q_u8(out, s);
}

void aes_encrypt_block_192(const uint8_t *in, uint8_t *out, const AES_KEY *key) {
    const uint8_t *rk = (const uint8_t *)key->rd_key;
    uint8x16_t s = vld1q_u8(in);
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 0 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 1 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 2 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 3 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 4 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 5 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 6 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 7 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 8 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 9 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 10 * 16)));
    s = vaeseq_u8(s, vld1q_u8(rk + 11 * 16));
    s = veorq_u8(s, vld1q_u8(rk + 12 * 16));
    vst1q_u8(out, s);
}

void aes_encrypt_block_256(const uint8_t *in, uint8_t *out, const AES_KEY *key) {
    const uint8_t *rk = (const uint8_t *)key->rd_key;
    uint8x16_t s = vld1q_u8(in);
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 0 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 1 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 2 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 3 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 4 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 5 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 6 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 7 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 8 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 9 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 10 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 11 * 16)));
    s = vaesmcq_u8(vaeseq_u8(s, vld1q_u8(rk + 12 * 16)));
    s = vaeseq_u8(s, vld1q_u8(rk + 13 * 16));
    s = veorq_u8(s, vld1q_u8(rk + 14 * 16));
    vst1q_u8(out, s);
}
