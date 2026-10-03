/**
 * McGrew & Viega, "The Galois/Counter Mode of Operation (GCM)", revised spec (May 31, 2005), Appendix B:
 * AES-GCM test cases 1–18 (AES-128/192/256), lowercase hex, '' = zero-length (test-only).
 * `j0` is the spec's Y₀ and `ghash` its GHASH(H, A, C).
 */
export interface GcmTestCase {
  readonly n: number;
  readonly key: string;
  readonly iv: string;
  readonly aad: string;
  readonly plaintext: string;
  readonly h: string;
  readonly j0: string;
  readonly ghash: string;
  readonly ciphertext: string;
  readonly tag: string;
}

export const GCM_TEST_CASES: readonly GcmTestCase[] = [
  {
    n: 1,
    key: '00000000000000000000000000000000',
    iv: '000000000000000000000000',
    aad: '',
    plaintext: '',
    h: '66e94bd4ef8a2c3b884cfa59ca342b2e',
    j0: '00000000000000000000000000000001',
    ghash: '00000000000000000000000000000000',
    ciphertext: '',
    tag: '58e2fccefa7e3061367f1d57a4e7455a',
  },
  {
    n: 2,
    key: '00000000000000000000000000000000',
    iv: '000000000000000000000000',
    aad: '',
    plaintext: '00000000000000000000000000000000',
    h: '66e94bd4ef8a2c3b884cfa59ca342b2e',
    j0: '00000000000000000000000000000001',
    ghash: 'f38cbb1ad69223dcc3457ae5b6b0f885',
    ciphertext: '0388dace60b6a392f328c2b971b2fe78',
    tag: 'ab6e47d42cec13bdf53a67b21257bddf',
  },
  {
    n: 3,
    key: 'feffe9928665731c6d6a8f9467308308',
    iv: 'cafebabefacedbaddecaf888',
    aad: '',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b391aafd255',
    h: 'b83b533708bf535d0aa6e52980d53b78',
    j0: 'cafebabefacedbaddecaf88800000001',
    ghash: '7f1b32b81b820d02614f8895ac1d4eac',
    ciphertext:
      '42831ec2217774244b7221b784d0d49c' +
      'e3aa212f2c02a4e035c17e2329aca12e' +
      '21d514b25466931c7d8f6a5aac84aa05' +
      '1ba30b396a0aac973d58e091473f5985',
    tag: '4d5c2af327cd64a62cf35abd2ba6fab4',
  },
  {
    n: 4,
    key: 'feffe9928665731c6d6a8f9467308308',
    iv: 'cafebabefacedbaddecaf888',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: 'b83b533708bf535d0aa6e52980d53b78',
    j0: 'cafebabefacedbaddecaf88800000001',
    ghash: '698e57f70e6ecc7fd9463b7260a9ae5f',
    ciphertext:
      '42831ec2217774244b7221b784d0d49c' +
      'e3aa212f2c02a4e035c17e2329aca12e' +
      '21d514b25466931c7d8f6a5aac84aa05' +
      '1ba30b396a0aac973d58e091',
    tag: '5bc94fbc3221a5db94fae95ae7121a47',
  },
  {
    n: 5,
    key: 'feffe9928665731c6d6a8f9467308308',
    iv: 'cafebabefacedbad',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: 'b83b533708bf535d0aa6e52980d53b78',
    j0: 'c43a83c4c4badec4354ca984db252f7d',
    ghash: 'df586bb4c249b92cb6922877e444d37b',
    ciphertext:
      '61353b4c2806934a777ff51fa22a4755' +
      '699b2a714fcdc6f83766e5f97b6c7423' +
      '73806900e49f24b22b097544d4896b42' +
      '4989b5e1ebac0f07c23f4598',
    tag: '3612d2e79e3b0785561be14aaca2fccb',
  },
  {
    n: 6,
    key: 'feffe9928665731c6d6a8f9467308308',
    iv:
      '9313225df88406e555909c5aff5269aa' +
      '6a7a9538534f7da1e4c303d2a318a728' +
      'c3c0c95156809539fcf0e2429a6b5254' +
      '16aedbf5a0de6a57a637b39b',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: 'b83b533708bf535d0aa6e52980d53b78',
    j0: '3bab75780a31c059f83d2a44752f9864',
    ghash: '1c5afe9760d3932f3c9a878aac3dc3de',
    ciphertext:
      '8ce24998625615b603a033aca13fb894' +
      'be9112a5c3a211a8ba262a3cca7e2ca7' +
      '01e4a9a4fba43c90ccdcb281d48c7c6f' +
      'd62875d2aca417034c34aee5',
    tag: '619cc5aefffe0bfa462af43c1699d050',
  },
  {
    n: 7,
    key: '000000000000000000000000000000000000000000000000',
    iv: '000000000000000000000000',
    aad: '',
    plaintext: '',
    h: 'aae06992acbf52a3e8f4a96ec9300bd7',
    j0: '00000000000000000000000000000001',
    ghash: '00000000000000000000000000000000',
    ciphertext: '',
    tag: 'cd33b28ac773f74ba00ed1f312572435',
  },
  {
    n: 8,
    key: '000000000000000000000000000000000000000000000000',
    iv: '000000000000000000000000',
    aad: '',
    plaintext: '00000000000000000000000000000000',
    h: 'aae06992acbf52a3e8f4a96ec9300bd7',
    j0: '00000000000000000000000000000001',
    ghash: 'e2c63f0ac44ad0e02efa05ab6743d4ce',
    ciphertext: '98e7247c07f0fe411c267e4384b0f600',
    tag: '2ff58d80033927ab8ef4d4587514f0fb',
  },
  {
    n: 9,
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c',
    iv: 'cafebabefacedbaddecaf888',
    aad: '',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b391aafd255',
    h: '466923ec9ae682214f2c082badb39249',
    j0: 'cafebabefacedbaddecaf88800000001',
    ghash: '51110d40f6c8fff0eb1ae33445a889f0',
    ciphertext:
      '3980ca0b3c00e841eb06fac4872a2757' +
      '859e1ceaa6efd984628593b40ca1e19c' +
      '7d773d00c144c525ac619d18c84a3f47' +
      '18e2448b2fe324d9ccda2710acade256',
    tag: '9924a7c8587336bfb118024db8674a14',
  },
  {
    n: 10,
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c',
    iv: 'cafebabefacedbaddecaf888',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: '466923ec9ae682214f2c082badb39249',
    j0: 'cafebabefacedbaddecaf88800000001',
    ghash: 'ed2ce3062e4a8ec06db8b4c490e8a268',
    ciphertext:
      '3980ca0b3c00e841eb06fac4872a2757' +
      '859e1ceaa6efd984628593b40ca1e19c' +
      '7d773d00c144c525ac619d18c84a3f47' +
      '18e2448b2fe324d9ccda2710',
    tag: '2519498e80f1478f37ba55bd6d27618c',
  },
  {
    n: 11,
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c',
    iv: 'cafebabefacedbad',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: '466923ec9ae682214f2c082badb39249',
    j0: 'a14378078d27258a6292737e1802ada5',
    ghash: '1e6a133806607858ee80eaf237064089',
    ciphertext:
      '0f10f599ae14a154ed24b36e25324db8' +
      'c566632ef2bbb34f8347280fc4507057' +
      'fddc29df9a471f75c66541d4d4dad1c9' +
      'e93a19a58e8b473fa0f062f7',
    tag: '65dcc57fcf623a24094fcca40d3533f8',
  },
  {
    n: 12,
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c',
    iv:
      '9313225df88406e555909c5aff5269aa' +
      '6a7a9538534f7da1e4c303d2a318a728' +
      'c3c0c95156809539fcf0e2429a6b5254' +
      '16aedbf5a0de6a57a637b39b',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: '466923ec9ae682214f2c082badb39249',
    j0: '4505cdc367a054c5002820e96aebef27',
    ghash: '82567fb0b4cc371801eadec005968e94',
    ciphertext:
      'd27e88681ce3243c4830165a8fdcf9ff' +
      '1de9a1d8e6b447ef6ef7b79828666e45' +
      '81e79012af34ddd9e2f037589b292db3' +
      'e67c036745fa22e7e9b7373b',
    tag: 'dcf566ff291c25bbb8568fc3d376a6d9',
  },
  {
    n: 13,
    key: '0000000000000000000000000000000000000000000000000000000000000000',
    iv: '000000000000000000000000',
    aad: '',
    plaintext: '',
    h: 'dc95c078a2408989ad48a21492842087',
    j0: '00000000000000000000000000000001',
    ghash: '00000000000000000000000000000000',
    ciphertext: '',
    tag: '530f8afbc74536b9a963b4f1c4cb738b',
  },
  {
    n: 14,
    key: '0000000000000000000000000000000000000000000000000000000000000000',
    iv: '000000000000000000000000',
    aad: '',
    plaintext: '00000000000000000000000000000000',
    h: 'dc95c078a2408989ad48a21492842087',
    j0: '00000000000000000000000000000001',
    ghash: '83de425c5edc5d498f382c441041ca92',
    ciphertext: 'cea7403d4d606b6e074ec5d3baf39d18',
    tag: 'd0d1c8a799996bf0265b98b5d48ab919',
  },
  {
    n: 15,
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
    iv: 'cafebabefacedbaddecaf888',
    aad: '',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b391aafd255',
    h: 'acbef20579b4b8ebce889bac8732dad7',
    j0: 'cafebabefacedbaddecaf88800000001',
    ghash: '4db870d37cb75fcb46097c36230d1612',
    ciphertext:
      '522dc1f099567d07f47f37a32a84427d' +
      '643a8cdcbfe5c0c97598a2bd2555d1aa' +
      '8cb08e48590dbb3da7b08b1056828838' +
      'c5f61e6393ba7a0abcc9f662898015ad',
    tag: 'b094dac5d93471bdec1a502270e3cc6c',
  },
  {
    n: 16,
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
    iv: 'cafebabefacedbaddecaf888',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: 'acbef20579b4b8ebce889bac8732dad7',
    j0: 'cafebabefacedbaddecaf88800000001',
    ghash: '8bd0c4d8aacd391e67cca447e8c38f65',
    ciphertext:
      '522dc1f099567d07f47f37a32a84427d' +
      '643a8cdcbfe5c0c97598a2bd2555d1aa' +
      '8cb08e48590dbb3da7b08b1056828838' +
      'c5f61e6393ba7a0abcc9f662',
    tag: '76fc6ece0f4e1768cddf8853bb2d551b',
  },
  {
    n: 17,
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
    iv: 'cafebabefacedbad',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: 'acbef20579b4b8ebce889bac8732dad7',
    j0: '0095df49dd90abe3e4d252475748f5d4',
    ghash: '75a34288b8c68f811c52b2e9a2f97f63',
    ciphertext:
      'c3762df1ca787d32ae47c13bf19844cb' +
      'af1ae14d0b976afac52ff7d79bba9de0' +
      'feb582d33934a4f0954cc2363bc73f78' +
      '62ac430e64abe499f47c9b1f',
    tag: '3a337dbf46a792c45e454913fe2ea8f2',
  },
  {
    n: 18,
    key: 'feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308',
    iv:
      '9313225df88406e555909c5aff5269aa' +
      '6a7a9538534f7da1e4c303d2a318a728' +
      'c3c0c95156809539fcf0e2429a6b5254' +
      '16aedbf5a0de6a57a637b39b',
    aad: 'feedfacedeadbeeffeedfacedeadbeefabaddad2',
    plaintext:
      'd9313225f88406e5a55909c5aff5269a' +
      '86a7a9531534f7da2e4c303d8a318a72' +
      '1c3c0c95956809532fcf0e2449a6b525' +
      'b16aedf5aa0de657ba637b39',
    h: 'acbef20579b4b8ebce889bac8732dad7',
    j0: '0cd953e2140a5976079f8e2406bc8eb4',
    ghash: 'd5ffcf6fc5ac4d69722187421a7f170b',
    ciphertext:
      '5a8def2f0c9e53f1f75d7853659e2a20' +
      'eeb2b22aafde6419a058ab4f6f746bf4' +
      '0fc0c3b780f244452da3ebf1c5d82cde' +
      'a2418997200ef82e44ae7e3f',
    tag: 'a44a8266ee1c8eb0c8b5d4cf5ae9f19a',
  },
];
