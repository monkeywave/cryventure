/*
 * Layout probe for OpenSSL's AES_KEY. Excerpt of include/openssl/aes.h at tag openssl-3.5.9
 * (lines 33-44), copied verbatim:
 *
 * Copyright 2002-2020 The OpenSSL Project Authors. All Rights Reserved.
 * Licensed under the Apache License 2.0 (the "License").  You may not use
 * this file except in compliance with the License.  You can obtain a copy
 * in the file LICENSE in the source distribution or at
 * https://www.openssl.org/source/license.html
 *
 * AES_LONG is deliberately left undefined: no file in the openssl-3.5.9 tree defines it, and the
 * linux-x86_64 / linux-aarch64 targets in Configurations/10-main.conf don't add it (SOURCES.md).
 * Consumed by packages/tools/src/layouts/generate.ts (`pnpm layouts:generate`).
 */
#undef AES_LONG

#define AES_MAXNR 14

/* This should be a hidden type, but EVP requires that the size be known */
struct aes_key_st {
#ifdef AES_LONG
    unsigned long rd_key[4 * (AES_MAXNR + 1)];
#else
    unsigned int rd_key[4 * (AES_MAXNR + 1)];
#endif
    int rounds;
};
typedef struct aes_key_st AES_KEY;

/* Forces clang to lay the record out, so -fdump-record-layouts prints it. */
int cv_layout_aes_key_st[sizeof(AES_KEY)];
