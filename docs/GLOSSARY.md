# German glossary and style guide

The English→German term base for every German string in CryVenture: catalogs
(`packages/**/i18n/de.json`, `apps/web/src/i18n/de/*.json`), lesson pages
(`apps/web/src/content/docs/de/**`) and sidebar labels. `pnpm i18n:check` enforces the
mechanical parts (see "Automated checks" below). Sources for the decisions: BSI TR-02102-1,
German Wikipedia articles on AES and cryptography, Paar/Pelzl *Kryptografie verständlich*,
Beutelspacher *Kryptologie*, Duden.

Status: drafted in an AI editorial review (2026-10). A native-speaker sign-off is still pending
(see `docs/translation-review-2026-10.md`).

## Term base

| English | German | Decision and rationale |
|---|---|---|
| plaintext | **Klartext** (der) | Standard term everywhere (BSI, textbooks). |
| ciphertext | **Geheimtext** (der) | One term only. „Geheimtext“ forms a transparent pair with „Klartext“ and is the common term in German teaching material (Beutelspacher, Wikipedia). „Chiffrat“ (BSI) is correct but opaque for beginners; „Chiffretext“ is an anglicism. Both are rejected by the lint. |
| cipher | **Chiffre** (die), **Verschlüsselungsverfahren** | „die Chiffre“ for the algorithm (AES as a whole). |
| cipher key | **Schlüssel**; „Chiffrierschlüssel“ only where it must be set apart from round keys | |
| key schedule (the result: all round-key words `w[i]`) | **Schlüsselplan** (der) | The data structure. Heading of the derivation view in AES labs (`plugin.aes.derivation.title`) and used wherever memory dumps are discussed. „Schlüsselablaufplan“ is rejected (long, rare). |
| KeyExpansion (the process, FIPS 197 §5.2) | **Schlüsselexpansion** (die), with the FIPS name `KeyExpansion` in parentheses on first use | Process ≠ result: the expansion *produces* the schedule. Never use „strecken“ (key stretching is a different concept: password KDFs). |
| round key | **Rundenschlüssel** (der) | |
| round / final round | **Runde** / **Schlussrunde** | „letzte Runde“ is fine in running text. |
| round constant (Rcon) | **Rundenkonstante** (die) | |
| state | **Zustand** (der); **Zustandsmatrix** for the 4×4 arrangement | UI and narration say „Zustand“; lesson text says „Zustandsmatrix“ when rows/columns matter. First mention on a page may add „(engl. *state*)“. |
| S-box | **S-Box** (die), compounds **S-Box-Tabelle**, **AES-S-Box** | Hyphenated, capital B. |
| block cipher / stream cipher | **Blockchiffre** / **Stromchiffre** | |
| mode of operation | **Betriebsmodus** (der) | |
| padding | **Padding** (das); explain once as „Auffüllen“ | Established technical term. |
| nonce | **Nonce** (die) | Established; explain once („einmal verwendete Zahl“). |
| IV | **Initialisierungsvektor (IV)** (der) | |
| XOR | **XOR**; verb **XOR-verknüpfen** or „per XOR verknüpfen“ | Both verb forms are fine; never „xoren“. |
| byte / bit | **das Byte**, **das Bit** | After a number use the unit form: „16 Byte“, „128 Bit“ (no plural -s). Without a number the plural is „Bytes“/„Bits“. Compounds: „16-Byte-Block“, „128-Bit-Schlüssel“, „AES-128-Schlüssel“. |
| word (32 bit) | **Wort** (das), plural **Wörter** | Not „Worte“. |
| step | **Schritt** (der) | „Teilschritt“ for a single operation inside a round (scope label). |
| operation (SubBytes, …) | **Operation** (die) | |
| breakpoint | **Haltepunkt** (der) | |
| watch (a cell) | **beobachten** | „Beobachtet: …“, „Nicht mehr beobachten“. |
| story mode / debugger | **Erzählmodus** / **Debugger** | |
| narration | **Erläuterung** (die) | |
| lab | **das Lab**, plural **Labs** | Not „Labor“ (lint warning). |
| lens (page-wide selector) | **Perspektive** (die) | Header label; badges read „Perspektive Kryptografie“. |
| lens names (`story`, `engineer`, `cryptographer`) | **Erzählung**, **Technik**, **Kryptografie** (proposed) | Used in `apps/web/src/i18n/de/lens.json`; name the perspective, not a person, to stay gender-neutral („Ingenieur“/„Kryptograf“ would need gendering). |
| SubBytes, ShiftRows, MixColumns, AddRoundKey, KeyExpansion, RotWord, SubWord, Inv… | **unchanged** (proper names from FIPS 197) plus a German gloss: „SubBytes – Bytes ersetzen“, „ShiftRows – Zeilen rotieren“, „MixColumns – Spalten mischen“, „AddRoundKey – XOR mit dem Rundenschlüssel“ | Students meet these names in FIPS 197, in code and in AES-NI mnemonics. |
| GF(2⁸) | **GF(2⁸)**, „der endliche Körper GF(2⁸)“ (also: Galoiskörper) | „Körper“, never „Feld“ (false friend of *field*). |
| irreducible / primitive polynomial | **irreduzibles** / **primitives Polynom** | |
| multiplicative inverse | **multiplikatives Inverses** (das) | |
| affine transformation | **affine Abbildung** | |
| fixed point / opposite fixed point | **Fixpunkt** / **entgegengesetzter Fixpunkt** | |
| branch number | **Verzweigungszahl** (die) | |
| MDS matrix | **MDS-Matrix** | |
| wide trail strategy | **Wide-Trail-Strategie** | |
| non-zero | **von null verschieden** | Not „Nicht-Null-…“. |
| nothing up my sleeve (numbers) | **„Nothing up my sleeve“-Zahlen**, gloss „nichts im Ärmel“ | The English idiom is the technical term; the gloss keeps the image. |
| side channel | **Seitenkanal** (der), **Seitenkanalangriff** | |
| constant-time (code) | **(Code mit) konstanter Laufzeit**, optionally „(constant-time)“ | Standard German rendering; strictly it means *secret-independent* timing. „Konstantzeit“ is rejected. |
| key recovery | **Schlüsselrekonstruktion** | |
| brute force | **vollständige Schlüsselsuche (Brute Force)** | |
| related-key attack / slide attack | **Related-Key-Angriff** / **Slide-Angriff** | Established names. |
| memory dump | **Speicherabbild** (das) | |
| cold-boot attack | **Cold-Boot-Angriff** | |
| test vector | **Testvektor** (der) | |
| endianness / host byte order | **Bytereihenfolge**, **Host-Bytereihenfolge** (labels) or „Bytereihenfolge des Hosts“ (running text), **Big-Endian**, **Little-Endian** | Established names, hyphenated. |
| most / least significant byte (MSB / LSB) | **höchstwertiges** / **niedrigstwertiges Byte** (MSB / LSB) | |
| one-time pad | **One-Time-Pad** (das) | Established name. |
| hex digit / hex text | **Hexziffer** (die), **Hextext** (der) | One word, no hyphen (like „Hexziffern“ in the core parse errors): „zwei Hexziffern“, „als Hextext“. |
| previous (navigation labels) | **vorheriger / vorherige / vorheriges** | „Vorherige Runde“, „Vorheriger Teilschritt“, „Vorheriges Exponentenbit“; not „vorige(r)“ in UI labels, paired with „Nächste(r/s)“. |
| field multiplication | **•** (FIPS 197), e.g. „{57} • {83} = {c1}“ | Same glyph in EN and DE catalogs; field elements in lowercase braces „{57}“. |

### Modes of operation (M3)

| English | German | Decision and rationale |
|---|---|---|
| counter mode (CTR) | **Zählermodus** (der), kurz CTR | First mention: „Zählermodus (engl. *Counter Mode*), kurz CTR“. |
| counter block | **Zählerblock** (der) | SP 800-38A §6.5 *counter block* `Tⱼ`. |
| initial counter block | **Anfangszählerblock** (der) | `T₁`, the first counter block of a message. |
| keystream | **Schlüsselstrom** (der); **Schlüsselstromblock** for one block | |
| malleable | **formbar**, on first use „formbar (engl. *malleable*)“ | Standard German rendering in textbooks; „verformbar“ is rejected. |
| zero byte / zero block | **Nullbyte** / **Nullblock** (one word) | „{{count}} Nullbyte“ needs no plural key (unit form). |

### GCM and GHASH (M4)

| English | German | Decision and rationale |
|---|---|---|
| authentication tag | **Authentifizierungs-Tag** (das); short **das Tag**, plural **Tags** | Hyphenated for readability (three-part compound with an English loan); „das Tag“ as in „HTML-Tag“ (not „der Tag“). „Authentifizierungstag“ is rejected by the lint (reads as *-tag* = day). Compounds: „Tag-Länge“, „Tag-Maske“, „96-Bit-Tag“. |
| additional authenticated data (AAD) | **zusätzliche authentifizierte Daten (AAD)**, then **die AAD** (plural) | SP 800-38D §5.2.1.1. Verbs in the plural: „Die AAD werden authentifiziert“. |
| hash subkey H | **Hash-Teilschlüssel H** (der) | „Teilschlüssel“ renders *subkey* (as in DES/Feistel teaching material); „Unterschlüssel“ rejected. |
| pre-counter block J0 | **Vorzählerblock J0** (der) | Parallels „Zählerblock“; the symbol `J0` always follows on first use. Matches `plugin.gcm.*` in `packages/primitives/src/gcm/i18n/de.json`. |
| GHASH, GMAC, GCTR, J0, inc32 | **unchanged** (SP 800-38D names) | „Galois/Counter Mode“ also stays English in running text. |
| Galois field | **Galoiskörper** (der); preferred in running text: „der Körper GF(2¹²⁸)“ | One word. „Galoisfeld“/„Galois-Feld“ (false friend) is an error, „Galois-Körper“ a warning in the lint. |
| length block | **Längenblock** (der) | `[len(A)]₆₄ ‖ [len(C)]₆₄`. |
| reflected bit order | **gespiegelte Bitreihenfolge** | SP 800-38D §6.3 („bit 0 is the MSB of byte 0“). |
| (almost) XOR-universal hash | **(fast) XOR-universeller Hash**, with „(engl. *almost XOR-universal*)“ on first use | |
| forgery / to forge (a tag) | **Fälschung** / **(ein Tag) fälschen** | |
| nonce reuse / nonce misuse | **wiederholte Nonce**, **Nonce-Wiederverwendung** / **Nonce-Missbrauch** | |
| record (TLS) | **Datensatz** (der), with „(engl. *record*)“ on first use | |

### Memory, registers and instructions (M4)

| English | German | Decision and rationale |
|---|---|---|
| struct layout | **Struct-Layout** (das) | C term kept; „Strukturaufbau“ would hide the `struct` keyword. |
| round keys in memory | **Rundenschlüssel im Speicher** | Label for `rk0`, `rk1`, … in the memory view. |
| register | **Register** (das), plural **Register** | „Vektorregister“, „XMM-Register“. |
| lane (of a vector register) | **Lane** (die), plural **Lanes** | Established SIMD term; no common German equivalent („Spur“ is used for the mode-chain lanes). |
| instruction | **Befehl** (der); **Ladebefehl** for a load | Not „Instruktion“. Mnemonics (`aesenc`, `aese`, `movdqu`) stay as they are. |
| instruction set / instruction set extension | **Befehlssatz** / **Befehlssatzerweiterung** (die) | Product names (AES-NI, ARMv8 Crypto Extensions) stay English. |
| calling convention | **Aufrufkonvention** (die) | |
| host byte order | **Host-Bytereihenfolge** (die); „u32-Wörter in Host-Bytereihenfolge“ | Replaces „host-endian“ in prose; „Bytereihenfolge des Hosts“ is fine in running text. „Byte-Reihenfolge“ is a lint warning. |
| stack / heap | **Stack** / **Heap** (der) | Established; not „Stapel“/„Halde“. |
| fly-through | **Kamerafahrt** (die) | Title of the AES fly-through island. Not „Rundflug“ (a round trip returns to its start). |
| track (curriculum) | **Lernpfad** (der); „der Lernpfad Geheimnisse im Speicher“ | Used for the curriculum tracks (PLAN §6). |

### Hash functions and SHA-2 (M5)

Checked against the DE catalogs `packages/primitives/src/{sha256,sha512,sha2-constants}/i18n/de.json`
and `packages/views/src/wordops/i18n/de.json` (2026-10-04): they already use these terms.

| English | German | Decision and rationale |
|---|---|---|
| hash function | **Hashfunktion** (die); sidebar group „Hashfunktionen“ | One word (Duden, BSI). Verb **hashen** („wird gehasht“, „das Lab hasht …“). |
| hash value / digest | **Hashwert** (der); first use may add „(engl. *digest*)“ | One term for both; „Digest“/„Hash“ alone avoided in prose. Compounds: „SHA-256-Hashwert“, „256-Bit-Hashwert“. |
| compression function | **Kompressionsfunktion** (die) | |
| chaining value | **Verkettungswert** (der) | `H⁽ⁱ⁾`; „Merkle–Damgård-Verkettung“ for the chaining itself. |
| Merkle–Damgård (construction), MD strengthening | **Merkle–Damgård-Konstruktion**; **MD-Verstärkung** with „(engl. *MD strengthening*)“ on first use | En dash between the names as in EN. HAC §9.3.2 (Algorithm 9.26) calls it „MD-strengthening“. |
| message schedule | **Nachrichtenexpansion** (die), first use „Nachrichtenexpansion (Message Schedule)“ | Parallels „Schlüsselexpansion“. Short label for one schedule word: „Expansionswort“. |
| working variables | **Arbeitsvariablen** (die, plural) `a … h` | |
| round constant | **Rundenkonstante** (die), as for AES | `K₀ … K₆₃`. |
| initial hash value (IV) | **Anfangswert (IV)** (der); `H(0)` | Not „Initialisierungsvektor“ here: FIPS 180-4 has no IV input, the value is fixed. Compounds: „SHA-256-Anfangswert“; „IV-Erzeugung“ (SHA-512/t). |
| preimage / second preimage | **Urbild** (das) / **zweites Urbild** | |
| preimage / second-preimage / collision resistance | **Urbildresistenz** / **Resistenz gegen zweite Urbilder** / **Kollisionsresistenz** (die) | „Zweites-Urbild-Resistenz“ rejected (clumsy). Textbook synonyms „Einwegeigenschaft“, „schwache/starke Kollisionsresistenz“ are not used (ambiguous across textbooks). |
| birthday bound | **Geburtstagsschranke** (die) | |
| security strength (NIST) | **Sicherheitsniveau** (das), „128 Bit gegen Kollisionen“ | BSI TR-02102-1 wording. |
| length extension (attack) | **Längenerweiterung** (die), **Längenerweiterungsangriff** | |
| truncation / truncated | **Kürzung** (die) / **gekürzt** („gekürzt auf die ersten 224 Bit“) | |
| feed-forward | **Feed-Forward** (der) | Established; no German equivalent in the literature. |
| padding | **Padding** (das), as in M3; verb „auffüllen“ | „Nachricht mit Padding“, „aufgefüllter Block“. |
| zero bit | **Nullbit** (das), one word like „Nullbyte“ | „7 Nullbits“. |
| one bit (the padding's leading `1`) | **Einsbit** (das), one word like „Nullbit“ | „hängt ein Einsbit an“. Not „1-Bit“ (reads as „1-bit“, a width). |
| word operations (wordops view) | **Wortoperationen** (die) | View title. Ops: „nach rechts rotieren/schieben“, „XOR-/UND-verknüpfen“, „bitweise invertieren (NICHT)“, „modulo 2ⁿ addieren“. |
| Ch, Maj, Σ0/Σ1, σ0/σ1 | **unchanged** (FIPS names), glossed „auswählen (Ch)“, „Mehrheit bilden (Maj)“, „großes/kleines Sigma“ | |
| prime / square root / cube root | **Primzahl** / **Quadratwurzel** / **Kubikwurzel** (die) | „Primzahl Nr. 9“ for the ninth prime. |
| fractional bits / fractional part | **Nachkommabits** (die, plural) / **Nachkommastellen** | „die ersten 32 Nachkommabits“; the hex fraction is written with a decimal comma („√2 = 1,6a09e667…“) in the DE narration. |
| SHA-NI, SHA extensions | **SHA-Erweiterungen (SHA-NI)**; „die SHA2-Befehle von ARMv8“ | Product names stay English. |
| random oracle | **Random Oracle** (das), unchanged | Established English term in German literature; no translation. |
| indifferentiable (Maurer et al.) | **unchanged, in italics**: „*indifferentiable* von einem Random Oracle (im Sinne von Maurer et al.)“ | „ununterscheidbar“ is rejected: it means *indistinguishable*, a different notion. |
| standard (FIPS, SP, RFC as documents) | **Standard** (der): „das Beispiel des Standards“ | Not „Norm“ (reserved for DIN/ISO norms). |
| left-most n bits (truncation) | **die ersten n Bit** | Not „die linken n Bit“. |
| ISA, instruction set | **Befehlssatz** (der), plural **Befehlssätze** | „ISA“ alone avoided in prose. |

### Sponge, SHA-3, BLAKE2, MD5 and SHA-1 (M6)

Settled from the M6 §7 proposals (2026-10-04) and checked against the DE catalogs
`packages/primitives/src/{sha3,keccak-constants,blake2,md5,sha1}`, `packages/views/src/sponge` and
`packages/derivers/src/{isa-armv8-sha3,isa-armv8-sha}`. Open points are in
`docs/translation-review-2026-10.md`, section „M6“.

| English | German | Decision and rationale |
|---|---|---|
| sponge construction | **Sponge-Konstruktion** (die), first use „Sponge-Konstruktion („Schwammkonstruktion“)“; short **Sponge** in titles and labels („Sponge-Zustand“) | FIPS 202 term kept; the German image only as a gloss. „Schwammfunktion“ not used. |
| rate / capacity | **Rate** (die) `r` / **Kapazität** (die) `c` | Compounds: „Rate-Block“, „Rate-Lanes“, „Kapazitäts-Lanes“. |
| absorb / squeeze | **absorbieren** / **auspressen**; phase labels **Absorbieren** / **Auspressen** | First use in prose may add „(engl. *squeeze*)“. „Squeeze-Phase“ not used in UI (one language per label). |
| permutation | **Permutation** (die); `Keccak-f[1600]`, `Keccak-p[b, nᵣ]` unchanged | |
| lane (Keccak, 64-bit word of the state) | **Lane** (die), plural **Lanes**; first use „Lane (64-Bit-Wort)“ or „25 Lanes, d. h. 64-Bit-Wörter“ | Same word as the SIMD lane (M4), deliberately: both are established anglicisms; „Spur“ stays reserved for the mode-chain lanes. Where both meanings meet (ARMv8 SHA3 registers), the Keccak lane is „Lane“ and the SIMD part is „untere/obere Hälfte“ of the register. |
| slice / row / column (Keccak state) | **Scheibe** (die), first use „Scheibe (Slice)“ / **Zeile** / **Spalte** | FIPS 202 §3.1.1 names; „Spaltenparität“ for θ's `C[x]`. |
| step mapping (θ, ρ, π, χ, ι) | **Schrittabbildung** (die); Greek letters unchanged | UI option „Pro Schrittabbildung“. |
| rotation offset (ρ), rotation amount | **Rotationsweite** (die) | As for SHA-2 (M5). Not „Offset“ or „Rotationsbetrag“ in labels. |
| round constant (ι, `RC`) | **Rundenkonstante** (die), as for AES and SHA-2 | |
| extendable-output function (XOF) | **Funktion mit erweiterbarer Ausgabe (XOF)** (die), then **die XOF**, plural **XOFs** | „anpassbare XOF“ for cSHAKE. |
| output byte(s) | **Ausgabebyte** (das); „336 Ausgabebyte“ (unit form), „die Ausgabebytes“ without a number | |
| domain separation | **Domänentrennung** (die); the suffix bits are **Domänenbits** | FIPS 202 §6.1/§6.2 suffixes `01`, `1111`. |
| customization string `S` / function name `N` (cSHAKE) | **Anpassungsstring S** (der) / **Funktionsname N** (der) | SP 800-185 §3.2. „Anpassungszeichenkette“ rejected (long). |
| keyed hashing | **schlüsselabhängiges Hashen**; labels „mit Schlüssel“ („BLAKE2s-256 mit 32-Byte-Schlüssel“) | |
| ARX | **ARX** (Addition, Rotation, XOR), unchanged | |
| HAIFA(-style) | **HAIFA**; „ARX im HAIFA-Stil“; salt → **Salt** (das) | |
| G function (BLAKE2) | **G-Funktion** (die); one call **G-Aufruf** (der) | RFC 7693 §3.1. „Spaltenaufruf“ / „Diagonalaufruf“ for the two halves of a round. |
| final-block flag (`f₀`) | **Flag für den letzten Block** (das) | RFC 7693 §3.2 *final block indicator*. „Abschlussflag“ / „Final-Flag“ rejected (coined / mixed). |
| counter `t` (BLAKE2) | **Zähler** (der); **Bytezähler** in prose | Not „Zählerblock“ (that is CTR, M3). |
| parameter block / working vector `v` | **Parameterblock** (der) / **Arbeitsvektor** (der) | RFC 7693 §2.5, §3.2. |
| chosen-prefix collision / identical-prefix collision | **Kollision mit gewähltem Präfix** / **Kollision mit identischem Präfix** (die) | Stevens et al. 2007. |
| detail level (lab parameter) | **Detailstufe** (die) | UI label in the hash and BLAKE2 producers; „Detailgrad“ is the older AES wording. |
| span (of an instruction, instructions view) | **Spanne** (die) | As on the AES-NI page (M4); not „Zeitspanne“. |

## Style guide

- **Address the reader with „du“** everywhere (imperative „Drück …“, „Geh …“, „Wähle …“). No
  „Sie“, avoid „man“ where „du“ reads naturally.
- **Quotation marks:** „…“ (U+201E / U+201C), nested ‚…‘. Never straight `"` in German prose.
- **Dashes:** a spaced en dash „ – “ for parenthetical dashes, also in titles („AES – ein erster
  Blick“). The en dash without spaces for ranges („Zeilen 1–3“). No em dash „—“.
- **Ellipsis:** „…“ (U+2026); with a space after a complete word („Wird geladen …“).
- **Abbreviations:** „z. B.“, „d. h.“, „u. a.“ with a space (ideally a narrow no-break space
  U+202F) between the parts.
- **Numbers and units:** „16 Byte“, „128 Bit“, „1 KiB“, „2¹²⁸“. Use a space between number and unit.
- **Compounds:** hyphenate when a part is an acronym, a number or a code name: „S-Box-Tabelle“,
  „AES-128-Schlüssel“, „16-Byte-Rundenschlüssel“, „MixColumns-Matrix“, „Cache-Timing-Angriff“.
- **Anglicisms:** prefer the German term from the table; keep identifiers, FIPS names, code,
  hex values and `{{params}}` untouched.
- **Section references:** „FIPS 197, §5.1.1“, „FIPS 197, Anhang B“ (Appendix → Anhang, Section →
  Abschnitt, Table → Tabelle, Figure → Abbildung, Equation → Gleichung).
- **Plurals in UI strings:** when a number is interpolated before a countable noun, use plural
  keys (`<key>_one` / `<key>_other`, see `docs/AUTHORING.md`) or a unit form that does not
  inflect („{{bytes}} Byte“).

## Automated checks

`pnpm i18n:check` runs `packages/tools/src/i18n/de-style.ts` over every DE catalog and DE page
(code, inline code, imports, links and identifier attributes are masked first).

| Check | Severity |
|---|---|
| straight double quote in prose | error |
| formal address („Sie“, „Ihnen“, „Ihr…“) in mid-sentence; allowlist `FORMAL_ADDRESS_ALLOWLIST` | error |
| rejected glossary variants (Chiffretext, Chiffrat, Ciphertext/Plaintext, S-box/Sbox, Konstantzeit, Schlüsselablaufplan, Authentifizierungstag, Galoisfeld) | error |
| discouraged spellings (Galois-Körper, Byte-Reihenfolge) | warning |
| „z.B.“, „d.h.“ … without a space | error |
| double space | error |
| „1“ followed by a plural noun („1 Positionen“), plural noun in a `_one` form | error |
| `{{count}}` + plural noun in a non-plural key | warning |
| em dash, „...“, „Labor“ | warning |

When you add a term decision, update the table above and, if it is mechanically checkable,
`GLOSSARY_RULES` in `de-style.ts`.
