/*
 * ARMv8.2 SHA3 Crypto Extensions: the Keccak-f[1600] permutation (AArch64), compiled by
 * packages/tools/src/asm/generate.ts (docs/M6.md §5b). A[x + 5y] is lane (x, y) as a host-endian
 * 64-bit word (FIPS 202 §3.1.2); each lane lives in the low half of its own vector register (aXY).
 * One loop iteration is one round (not unrolled): theta parity with eor3, theta D with rax1, theta,
 * rho and pi together with xar (the result lands in the register of the lane's pi destination),
 * chi with bcax, iota with eor.
 */
#include <stdint.h>
#include <arm_neon.h>

static const uint64_t RC[24] = {
    0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000,
    0x000000000000808b, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008a, 0x0000000000000088, 0x0000000080008009, 0x000000008000000a,
    0x000000008000808b, 0x800000000000008b, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
};

/* Lane (x, y) into the low half of a vector register (high half zero), and back. */
#define LOAD(x, y) vcombine_u64(vld1_u64(A + (x) + 5 * (y)), vdup_n_u64(0))
#define STORE(x, y, lane) vst1_u64(A + (x) + 5 * (y), vget_low_u64(lane))

/* Column parity C[x] of the five lanes of column x. */
#define PARITY(x) veor3q_u64(veor3q_u64(a##x##0, a##x##1, a##x##2), a##x##3, a##x##4)

/* (lane xor D[x]) rotated left by the rho offset r: xar rotates right, by (64 - r) mod 64. */
#define THETA_RHO(lane, d, r) vxarq_u64(lane, d, (64 - (r)) % 64)

/* chi for lane (x, y): B[x] ^ (~B[x+1] & B[x+2]), as bcax(B[x], B[x+2], B[x+1]). */
#define CHI(x0, x1, x2, y) vbcaxq_u64(b##x0##y, b##x2##y, b##x1##y)

void keccak_f1600(uint64_t A[25]) {
    uint64x2_t a00 = LOAD(0, 0), a10 = LOAD(1, 0), a20 = LOAD(2, 0), a30 = LOAD(3, 0), a40 = LOAD(4, 0);
    uint64x2_t a01 = LOAD(0, 1), a11 = LOAD(1, 1), a21 = LOAD(2, 1), a31 = LOAD(3, 1), a41 = LOAD(4, 1);
    uint64x2_t a02 = LOAD(0, 2), a12 = LOAD(1, 2), a22 = LOAD(2, 2), a32 = LOAD(3, 2), a42 = LOAD(4, 2);
    uint64x2_t a03 = LOAD(0, 3), a13 = LOAD(1, 3), a23 = LOAD(2, 3), a33 = LOAD(3, 3), a43 = LOAD(4, 3);
    uint64x2_t a04 = LOAD(0, 4), a14 = LOAD(1, 4), a24 = LOAD(2, 4), a34 = LOAD(3, 4), a44 = LOAD(4, 4);
#pragma clang loop unroll(disable)
    for (int round = 0; round < 24; ++round) {
        uint64x2_t c0 = PARITY(0);
        uint64x2_t c1 = PARITY(1);
        uint64x2_t c2 = PARITY(2);
        uint64x2_t c3 = PARITY(3);
        uint64x2_t c4 = PARITY(4);
        /* D[x] = C[x-1] ^ rot(C[x+1], 1) */
        uint64x2_t d0 = vrax1q_u64(c4, c1);
        uint64x2_t d1 = vrax1q_u64(c0, c2);
        uint64x2_t d2 = vrax1q_u64(c1, c3);
        uint64x2_t d3 = vrax1q_u64(c2, c4);
        uint64x2_t d4 = vrax1q_u64(c3, c0);
        /* pi: lane (x, y) moves to (y, 2x + 3y) */
        uint64x2_t b00 = THETA_RHO(a00, d0, 0);
        uint64x2_t b02 = THETA_RHO(a10, d1, 1);
        uint64x2_t b04 = THETA_RHO(a20, d2, 62);
        uint64x2_t b01 = THETA_RHO(a30, d3, 28);
        uint64x2_t b03 = THETA_RHO(a40, d4, 27);
        uint64x2_t b13 = THETA_RHO(a01, d0, 36);
        uint64x2_t b10 = THETA_RHO(a11, d1, 44);
        uint64x2_t b12 = THETA_RHO(a21, d2, 6);
        uint64x2_t b14 = THETA_RHO(a31, d3, 55);
        uint64x2_t b11 = THETA_RHO(a41, d4, 20);
        uint64x2_t b21 = THETA_RHO(a02, d0, 3);
        uint64x2_t b23 = THETA_RHO(a12, d1, 10);
        uint64x2_t b20 = THETA_RHO(a22, d2, 43);
        uint64x2_t b22 = THETA_RHO(a32, d3, 25);
        uint64x2_t b24 = THETA_RHO(a42, d4, 39);
        uint64x2_t b34 = THETA_RHO(a03, d0, 41);
        uint64x2_t b31 = THETA_RHO(a13, d1, 45);
        uint64x2_t b33 = THETA_RHO(a23, d2, 15);
        uint64x2_t b30 = THETA_RHO(a33, d3, 21);
        uint64x2_t b32 = THETA_RHO(a43, d4, 8);
        uint64x2_t b42 = THETA_RHO(a04, d0, 18);
        uint64x2_t b44 = THETA_RHO(a14, d1, 2);
        uint64x2_t b41 = THETA_RHO(a24, d2, 61);
        uint64x2_t b43 = THETA_RHO(a34, d3, 56);
        uint64x2_t b40 = THETA_RHO(a44, d4, 14);
        a00 = CHI(0, 1, 2, 0);
        a10 = CHI(1, 2, 3, 0);
        a20 = CHI(2, 3, 4, 0);
        a30 = CHI(3, 4, 0, 0);
        a40 = CHI(4, 0, 1, 0);
        a01 = CHI(0, 1, 2, 1);
        a11 = CHI(1, 2, 3, 1);
        a21 = CHI(2, 3, 4, 1);
        a31 = CHI(3, 4, 0, 1);
        a41 = CHI(4, 0, 1, 1);
        a02 = CHI(0, 1, 2, 2);
        a12 = CHI(1, 2, 3, 2);
        a22 = CHI(2, 3, 4, 2);
        a32 = CHI(3, 4, 0, 2);
        a42 = CHI(4, 0, 1, 2);
        a03 = CHI(0, 1, 2, 3);
        a13 = CHI(1, 2, 3, 3);
        a23 = CHI(2, 3, 4, 3);
        a33 = CHI(3, 4, 0, 3);
        a43 = CHI(4, 0, 1, 3);
        a04 = CHI(0, 1, 2, 4);
        a14 = CHI(1, 2, 3, 4);
        a24 = CHI(2, 3, 4, 4);
        a34 = CHI(3, 4, 0, 4);
        a44 = CHI(4, 0, 1, 4);
        a00 = veorq_u64(a00, vcombine_u64(vld1_u64(RC + round), vdup_n_u64(0)));
    }
    STORE(0, 0, a00); STORE(1, 0, a10); STORE(2, 0, a20); STORE(3, 0, a30); STORE(4, 0, a40);
    STORE(0, 1, a01); STORE(1, 1, a11); STORE(2, 1, a21); STORE(3, 1, a31); STORE(4, 1, a41);
    STORE(0, 2, a02); STORE(1, 2, a12); STORE(2, 2, a22); STORE(3, 2, a32); STORE(4, 2, a42);
    STORE(0, 3, a03); STORE(1, 3, a13); STORE(2, 3, a23); STORE(3, 3, a33); STORE(4, 3, a43);
    STORE(0, 4, a04); STORE(1, 4, a14); STORE(2, 4, a24); STORE(3, 4, a34); STORE(4, 4, a44);
}
