# German translation review – October 2026

**Type:** AI editorial review (Claude acting as a German technical editor for cryptography), 2026-10-02.
**Not** a native-speaker sign-off: every reviewed page is marked `translation.status: ai-reviewed`;
a human reviewer sets `human-reviewed` (workflow: `docs/AUTHORING.md`, "Translation review").
Term base and style guide: `docs/GLOSSARY.md`.

## Scope

- All DE catalogs: `packages/core/i18n`, `packages/primitives/src/aes/i18n`, `packages/viz/src/i18n`,
  `packages/views/src/{narration,key-schedule,state}/i18n`, `apps/web/src/i18n/de/{ui,lesson}.json`,
  `apps/web/src/content/i18n/de.json` (empty, Starlight defaults), sidebar labels in
  `apps/web/astro.config.mts` (no change needed).
- All 7 DE pages under `apps/web/src/content/docs/de/` (home, welcome lab, five AES lessons).

## Summary

- The existing translation was good: correct du-form, „…“ quotes and German number formats almost
  everywhere. The main problems were terminology drift, a real plural bug, and a few literal
  phrasings.
- **Catalogs:** 17 DE strings edited, 2 keys split into plural forms (4 EN + 4 DE variants).
- **Pages:** 55 edits across 7 pages; all 7 pages stamped `ai-reviewed` / `2026-10-02`.
  `sourceHash` values are unchanged.
- **Plural support:** `createTranslator(messages, { locale })` now picks `<key>_one` / `<key>_other`
  (`Intl.PluralRules`). The ShiftRows narration now passes `count` (the producer param `shift` was
  renamed to `count` in `packages/primitives/src/aes/choreo/shift.ts`).
- **Lint:** `pnpm i18n:check` now runs a German style lint (glossary terms, quotes, du-form,
  abbreviations, double spaces, „1 Positionen“).

## Glossary decisions (short)

| Term | Decision |
|---|---|
| ciphertext | **Geheimtext** (Klartext/Geheimtext pair). „Chiffretext“ (used before) and „Chiffrat“ are rejected by the lint. |
| key schedule vs. KeyExpansion | **Schlüsselplan** = result, **Schlüsselexpansion** = process. One page said „erkennt … eine Schlüsselexpansion im Speicherabbild“; now „einen Schlüsselplan“. |
| state | **Zustand** in UI/narration, **Zustandsmatrix** in lesson text about rows/columns. |
| byte/bit after numbers | Unit form: „16 Byte“, „128 Bit“. |
| constant-time | „Code mit **konstanter Laufzeit** (constant-time)“ instead of „Konstantzeit-Code“. |
| lab | „das Lab“ everywhere (one string said „Labor“). |
| AES operation names | Kept as FIPS names, with German gloss in the op labels. |

## Notable changes (before → after)

1. **Plural bug** (narration): „Zeile 1 rotiert um 1 Positionen“ → „Zeile 1 rotiert um 1 Position“
   (`_one` / `_other` forms; the EN text had the same bug: „rotates 1 positions“).
2. **Ciphertext term** (4 pages, 1 diagram): „Chiffretext“ → „Geheimtext“.
3. **Wrong concept:** „wie AES einen Schlüssel … zu Nr + 1 Rundenschlüsseln **streckt**“ → „**erweitert**“
   („strecken“ suggests *key stretching*, a password KDF concept).
4. **Imprecise rule:** „jedes weitere Wort ist das Wort `Nk` Positionen davor, per XOR verknüpft mit
   einer umgeformten Kopie des vorigen Worts“ → „… mit dem vorigen Wort XOR-verknüpft wird – bei
   jedem `Nk`-ten Wort mit einer umgeformten Kopie davon“ (only every `Nk`-th word is transformed).
5. **Process vs. result:** „erkennt ein Scanner eine Schlüsselexpansion in einem Speicherabbild“ →
   „einen Schlüsselplan“; „nach expandierten Rundenschlüsseln durchsuchen“ → „nach einem expandierten
   Schlüsselplan“.
6. **Units:** „Der Schlüssel hat {{length}} Bytes; AES braucht 16, 24 oder 32 Bytes.“ → „Der Schlüssel
   ist {{length}} Byte lang; AES braucht 16, 24 oder 32 Byte.“ (also „Klartext (16 Byte)“,
   „{{region}} · {{bytes}} Byte“).
7. **Term coinage:** „keinen **Gegenfixpunkt**“ → „keinen **entgegengesetzten Fixpunkt**“;
   „Nicht-Null-Bytes“ → „von null verschiedene Bytes“; „Konstantzeit-Code“ → „Code mit konstanter
   Laufzeit“.
8. **Grammar/logic:** „prüfe …, dass du beim Chiffretext … ankommst – genau den Bytes aus FIPS 197“ →
   „prüfe …, ob du beim Geheimtext … ankommst – genau bei den Bytes aus FIPS 197“; „halten alle
   Rundenschlüssel so lange im Speicher wie den Kontext“ → „…, wie der Kontext besteht“.
9. **Ambiguous / accidental formal look:** „Spalte {{col}}: Ihre vier Bytes werden …“ (reads like
   formal „Ihre“) → „Spalte {{col}}: Die vier Bytes der Spalte werden …“; „Wer in einen Debugger
   schaut, sieht …“ and „Ändert man …“ → du-form.
10. **Translationese:** „Um 2002 behauptete der XSL-Angriff, genau sie auszunutzen“ → „Um 2002 sollte
    der XSL-Angriff genau sie ausnutzen; diese Behauptungen hielten einer Überprüfung aber nicht
    stand“; „Jedes Byte ist nur ein Tabellenzugriff“ → „Für jedes Byte genügt ein Tabellenzugriff“;
    „je Runde ein Rundenschlüssel aus 4 Wörtern, plus einer“ → „… und einen weiteren für die
    anfängliche Schlüsseladdition“.

Smaller fixes: em dashes in titles → spaced en dash („AES – ein erster Blick“, hero title);
„vorbereitet…“ → „vorbereitet …“; „per XOR verknüpft“ → „XOR-verknüpft“ in the grid legend;
„Unbekannte Detailstufe“ → „Unbekannter Detailgrad“ (matches the field label); „öffnet bei“ →
„startet bei“; „billig“ → „günstig“; „Linksshift“ → „Linksverschiebung“; „OpenSSLs AES_KEY“ →
„AES_KEY in OpenSSL“; „strukturell gleich aufgebaut“ → „strukturell ähnlich“ (EN: *alike*).

## EN issues found (reported, not changed)

- `plugin.aes.beat.{shiftRows,invShiftRows}.row`: „rotates 1 positions“ – **fixed** via plural forms.
- `key-expansion.mdx`: „every further word is the word `Nk` positions earlier XOR a transformed copy
  of the previous word“ – only every `Nk`-th word (and for AES-256 `i mod 8 = 4`) is transformed.
  Not changed, to keep the DE `sourceHash` stable; suggest an EN fix plus re-stamp.
- `index.mdx` (AES at a glance): „the **key schedule** expands it into `Nr + 1` round keys“ – the
  KeyExpansion *produces* the schedule; consider „KeyExpansion expands it into …“.
- `shiftrows-mixcolumns.mdx`: `this "wide trail"` uses straight quotes, while the EN catalogs use
  curly quotes.
- `view.state.region.summary` „{{bytes}} bytes“ would read „1 bytes“ for a 1-byte region (does not
  occur today); `RegionDisclosure.tsx` would need to pass `count` to use plural forms.

## Open questions for the human reviewer

1. **Geheimtext vs. Chiffrat:** OK to prefer the didactic „Geheimtext“ over the BSI term
   „Chiffrat“? (Could be mentioned once as a synonym on the AES overview page.)
2. ~~**„Teilschritt {{ordinal}}“** (AES scope label) vs. „Operation {{ordinal}}“ (viz scope label)~~ –
   resolved: both scope labels and the op-level navigation („Nächster/Voriger Teilschritt“) now use
   the glossary term „Teilschritt“.
3. **„Knack es“** as the part name for *Break it*: fine, or „Brich es“ / „Angriff“?
4. **„Spielwiese“** for *Playground* and **„Erzählmodus“** for *Story*: natural for the audience?
5. **„Nichts im Ärmel?“** as a heading for *Nothing up the sleeve?*: keep the image, or use
   „Nothing up my sleeve?“ with a gloss?
6. **„Chiffrierschlüssel“** (key-expansion page) vs. plain „Schlüssel“.
7. **Narrow no-break spaces** in „z. B.“ / „16 Byte“: worth enforcing (currently plain spaces)?
8. **„verwürfelt“** in the 404 text („vielleicht hat Eve den Link verwürfelt“) – a pun on the
   technical term (*scrambling*); does it land?
9. Lens names (no UI yet): „Erzählung / Technik / Kryptografie“ proposed in the glossary.

## M4

Scope (AI editorial review, 2026-10-03): new pages `de/symmetric/modes/{ghash,gcm}.mdx`, the
updated `de/symmetric/modes/index.mdx`, and the DE catalogs `packages/primitives/src/{ghash,gcm}`,
`packages/views/src/{field,instructions,registers,memory,mode-chain,wire}`, `packages/derivers/src/{isa-x86,isa-armv8,memory}`,
`apps/web/src/i18n/de/{flyThrough,hero}.json`. Term decisions are in `docs/GLOSSARY.md` (sections
„Modes of operation (M3)“, „GCM and GHASH (M4)“, „Memory, registers and instructions (M4)“).

Fixed in this pass:

- „Authentifizierungstag“ (ctr.mdx) → „Authentifizierungs-Tag“, as in the gcm/mode-chain/wire
  catalogs; the lint now rejects the unhyphenated form.
- flyThrough: „Big Endian“ → „Big-Endian“, „Byte-Reihenfolge“ → „Bytereihenfolge“, „128-Bit-Load“ →
  „128-Bit-Ladebefehl“.
- hero: „Null-Byte“ → „Nullbyte“ (as in the ecb/cbc/gcm catalogs).
- `view.memory.wordsHint`: „host-endian u32“ → „u32-Felder in Host-Bytereihenfolge“.
- `plugin.gcm.step.j0Fast`: incomplete clause („…, der schnelle Weg:“) → „also gilt der schnelle Weg:“.
- `view.registers.legendInFlight`: unclear „es“ → „diesen Wert“.
- hero: „Tippe bis zu 16 Byte“ / „Tippe deinen eigenen Text“ → „Gib … ein“; plural „+ n Nullbytes Padding“.
- isa-armv8 fusion note now matches EN („Deshalb hält der Compiler die beiden direkt nebeneinander.“).
- ghash.mdx: „modulo dem Körperpolynom“ → „modulo des Körperpolynoms“.

Open questions for the human reviewer:

1. **„Authentifizierungs-Tag“, „das Tag“**: hyphenated form and neuter article OK? („Authentifizierungsmarke“
   would avoid the anglicism but is rare in practice.)
2. **„Vorzählerblock J0“** for *pre-counter block*: natural, or keep „Pre-Counter-Block“?
3. **„Hash-Teilschlüssel H“** vs. „Hash-Schlüssel H“ (simpler, but loses *sub*).
4. ~~**„Rundflug“** for *fly-through* (`ui.flyThrough.title`)~~ – resolved: „Kamerafahrt“ (a sightseeing
   flight returns to its start; a camera move follows the bytes one way). Glossary and catalog updated.
5. **„Lane(s)“** in the registers view and fly-through: keep the SIMD anglicism, or „Spur“ (already
   used for the mode-chain lanes, so it could be ambiguous)?
6. **„modelliert“ vs. „aufgezeichnet“** for memory provenance: clear enough without a tooltip?
7. **„schlüsselabhängiger Hash“** for *keyed hash* (ghash.mdx, index.mdx) vs. „Hash mit Schlüssel“.
8. `view.field.more_{one,other}` („+ 1 weiterer“ / „+ 3 weitere“): the noun (Term) is implicit; add
   „Term/Terme“?
9. EN note (not changed): `plugin.gcm.field.*` uses `·` for the field product while `plugin.ghash.*`
   and the lesson pages use `•` (SP 800-38D); align in EN and DE together.

AES memory/ISA pages (AI editorial review, 2026-10-03): new `de/symmetric/aes/{memory-abi,aes-ni}.mdx`,
updated `de/symmetric/aes/memory-and-hardware.mdx` (ComingSoon removed, links to both lessons, new
question `aesenc-key-last`). Open questions:

10. ~~**„Lernpfad“** for *track*~~ – resolved: the glossary now lists *track* → „Lernpfad“; the DE track
    name „Geheimnisse im Speicher“ is fixed once the track exists.
11. ~~**„toter Speicherzugriff (engl. *dead store*)“**~~ – resolved: „überflüssiger Schreibzugriff (engl.
    *dead store*)“ (a dead store is a write, not any access).
12. **„Ausrichtung“** for *align* in KeyFacts („244 B · Ausrichtung 4“) and „Zielplattform“ for
    *target triple*: natural, or keep „Alignment“/„Triple“ next to `sizeof`/`alignof`?
13. **„Schlüssel-XOR-Verknüpfung“** (aes-ni.mdx) for *key XOR*: clumsy? Alternative: „noch ein XOR mit
    dem Schlüssel“.
14. **„Spanne“** for an instruction's *span* of textbook steps (aes-ni.mdx, question `aese-span`):
    matches the instructions view catalog?
15. Code comments inside `<Formula>` listings (`; round 1`, `; ciphertext`, `offset field`) stay
    English like the code itself; translate them?

## M5

Scope (AI editorial review, 2026-10-04): new page `de/hash/index.mdx` (translated from
`en/hash/index.mdx`, `sourceHash` stamped, `status: ai-reviewed`). Term decisions are in
`docs/GLOSSARY.md`, section „Hash functions and SHA-2 (M5)“; all M5 §7 proposals were adopted as
proposed. The DE catalogs `packages/primitives/src/{sha256,sha512,sha2-constants}` and
`packages/views/src/wordops` were checked against them: no term contradicts the glossary (they were
not edited in this pass). `de/hash/sha256.mdx` and `de/hash/sha512.mdx` follow once the EN pages exist.

Fixed in this pass (own draft):

- „Kollision des Hashs“ → „Kollision der Hashfunktion“ (EN *collision of the hash* means the function).
- Description: „Urbild-, Zweites-Urbild- und Kollisionsresistenz“ → „Urbildresistenz, Resistenz gegen
  zweite Urbilder und Kollisionsresistenz“.

Catalog notes (not changed, for the catalog owner):

- Imperative style: ~~`plugin.sha2-constants.error.invalidParams` „Wähl eine Konstantentabelle.“ vs.
  „Wähle …“ in the sha256/sha512 errors~~ **fixed** („Wähle …“). Still open: `view.wordops.upcoming`
  „drücke ▶“ (as in `view.field`/`view.math`) vs. „Drück …“ in the style guide. Align on one form?
- ~~`plugin.sha2-constants` mixes „Nachkommastellen“ (initial texts) and „Nachkommabits“ (steps, terms);
  both are correct, but „die ersten 32 Bit der Nachkommastellen“ could simply read „die ersten 32
  Nachkommabits“.~~ **Fixed**: the catalog now says „Nachkommabits“ throughout.

Open questions for the human reviewer:

1. **„Resistenz gegen zweite Urbilder“** (quiz option, description) vs. the textbook synonym
   „schwache Kollisionsresistenz“ (and „Einwegeigenschaft“ for preimage resistance). Chosen to mirror
   the EN notion names 1:1; is the long form acceptable as a quiz option?
2. **„Verkettungswert“** for *chaining value* and **„Nachrichtenexpansion (Message Schedule)“** for
   *message schedule*: natural for readers of German textbooks, or keep „Message Schedule“?
3. **„Anfangswert (IV)“** for *initial hash value*: the abbreviation IV may suggest an input
   („Initialisierungsvektor“); fine with the explanation in the glossary?
4. **„Verstärkung“ (engl. *strengthening*)** in the WhyBox for MD strengthening; „Längenverstärkung“
   or „MD-Verstärkung“ clearer?
5. **„Geburtstagsschranke“** for *birthday bound* vs. „Geburtstagsgrenze“; and „Sicherheitsniveau“
   for NIST *security strength* („Sicherheitsstärke“ is a literal but rare rendering).
6. **„1-Bit“** („ein `1`-Bit“, „nach dem 1-Bit“) for *the 1 bit* of the padding: unambiguous next to
   „1 Bit“ (quantity)? Alternative: „ein Einsbit“ / „das Bit 1“ (used in `plugin.sha256.step.pad_*`).
7. **„Feed-Forward“** kept English (masculine „der Feed-Forward“); ok, or „Vorwärtskopplung“?
8. Story lens: „Ein Mixer mit Gedächtnis … eine 64-Byte-Portion“ – does the image work in German?
9. „Das Beispiel der Norm selbst ist „abc““ – FIPS 180-4 as „Norm“ (strictly a *standard*, „Standard“)?
10. Ref titles stay English (paper and section titles), only „Section/Table/Figure“ are translated,
    as on the M3/M4 pages.

### M5 – `de/hash/sha512.mdx`

Scope (AI editorial review, 2026-10-04): new page `de/hash/sha512.mdx`, translated from
`en/hash/sha512.mdx` (`sourceHash` stamped, `status: ai-reviewed`). Same components, props, lab ids,
question ids and `answer` indexes as EN; refs translated as on `de/hash/index.mdx` (only
Section/Sections/Table/Figure and descriptive parentheticals translated, FIPS section titles kept).
Glossary terms used: Hashwert, Anfangswert (IV), Verkettungswert, Arbeitsvariablen, Nachkommabits,
Kubik-/Quadratwurzel, Primzahl, Kürzung/gekürzt, Längenerweiterung, Feed-Forward, „Wortoperationen“.

Editorial pass vs. EN: meaning, numbers, hex values and section references match; no style-lint
findings for the page. `../sha256/` links point to a page that does not exist yet in either locale
(EN as well; resolves once `hash/sha256` is written).

Open questions for the human reviewer:

1. **„ununterscheidbar (indifferentiable)“** in the cryptographer lens: German „ununterscheidbar“
   usually renders *indistinguishable*; Maurer et al.'s *indifferentiability* has no settled German
   term. Keep the English gloss, or write „indifferenzierbar“?
2. **„linke 384 Bit“** for *left 384 bits* (FIPS *left-most*), also in quiz 2 („die linken 384 von
   512 Bit“): ok, or „die ersten / höchstwertigen 384 Bit“?
3. **„Rotationsweiten“** for *rotation amounts*; alternative „Rotationsbeträge“ / „Verschiebeweiten“.
4. Table header **„Zurückgehaltener Zustand“** for *State withheld* (values „0 Bit“ … „nur 32 Bit“):
   clear enough, or „Verborgene Zustandsbits“?
5. **„Konstruktion mit geheimem Präfix“** for *secret-prefix construction* and **„weiterhashen“**
   (colloquial verb from „hashen“) – acceptable?
6. „Eine nachprüfbare Beobachtung, keine Aussage der Norm“ – same „Norm“ vs. „Standard“ question as
   item 9 for the index page.
7. Story lens: „Derselbe Mixer mit einer größeren Schüssel … gießen nur einen Teil des Ergebnisses
   aus“ – continues the index page's mixer image; reads naturally?
8. **„Random Oracle“** kept English (no glossary entry yet); add to the glossary (vs.
   „Zufallsorakel“)?

### M5 – `de/hash/sha256.mdx`

Scope (AI editorial review, 2026-10-04): new page `de/hash/sha256.mdx`, translated from
`en/hash/sha256.mdx` (`sourceHash` stamped, `status: ai-reviewed`). Same components, props, lab ids,
`variant`/`startAt`/`layout` values, question ids and `answer` indexes as EN; refs translated as on
the other hash pages (Section → Abschnitt, steps → Schritte, descriptive parentheticals translated;
FIPS section titles and paper titles kept). Glossary terms used: Arbeitsvariablen,
Nachrichtenexpansion (Message Schedule) / Expansionswort, Verkettungswert, Rundenkonstante,
Anfangswert (IV), Nachkommabits, Kubik-/Quadratwurzel, Primzahl, Feed-Forward, SHA-Erweiterungen
(SHA-NI), „die SHA2-Befehle von ARMv8“, „Wortoperationen“. Hex fractions use the decimal comma
(„∛2 = 1,428a2f98…“) as in the DE narration.

Editorial pass vs. EN: meaning, numbers, hex values and section references match; no style-lint
findings. Fixed in this pass: description „die Intel-Befehle SHA-NI und …“ → „Intels SHA-NI- und die
ARMv8-SHA2-Befehle“; „Variantenauswahl“ → „die Auswahl „Befehlssatz““, the actual DE label of the
picker (`view.instructions.variant`).

Open questions for the human reviewer:

1. **„Nothing up my sleeve“-Zahlen („nichts im Ärmel“)**: English term kept with a German gloss;
   heading „Nichts im Ärmel“. Natural, or drop the English term?
2. **„Versionen mit reduzierter Rundenzahl“** for *reduced-round versions*, while the same sentence
   keeps „31 von 64 Schritten“ (EN *steps*, as in Mendel et al.). Ok?
3. **„Expansionsschritt“** (playground) for *schedule step*, and „Expansionswörter“ for *schedule
   words* (memory part): consistent with the glossary short label, but does it match the sha256
   catalog's step label?
4. **„Davies–Meyer-Feed-Forward“** (cryptographer lens): compound with an en dash as in
   „Merkle–Damgård-Konstruktion“; ok?
5. **„Designer“** for the constant designer in the break part (vs. „Entwickler“ / „Entwerfer“).
6. Story lens: „Acht Becher auf einem Förderband … rücken einen Platz weiter“ – reads naturally?
7. Formula comments translated („x wählt zwischen y und z“, „bitweise Mehrheit“), unlike the M4 code
   listings (see item 15 above); `ROTR`/`SHR` glossed in the caption as „nach rechts rotieren/schieben“.
8. „ISAs“ (plural acronym) in „wechselt zwischen den ISAs“ vs. „Befehlssatzarchitekturen“.

### M5 – review decisions (2026-10-04)

A verified crypto/German review settled the M5 open questions above. Human review of the three DE
hash pages is **still pending**; the pages stay `status: ai-reviewed`.

Resolved, kept as drafted:

- index 1, 2, 3, 5, 7: „Resistenz gegen zweite Urbilder“, „Verkettungswert“, „Nachrichtenexpansion
  (Message Schedule)“, „Anfangswert (IV)“, „Geburtstagsschranke“, „Sicherheitsniveau“, „Feed-Forward“.
- index 8, sha512 7, sha256 6: the story images (mixer, bowl, conveyor) stay.
- index 10: ref titles stay English.
- sha512 3, 5: „Rotationsweiten“, „Konstruktion mit geheimem Präfix“, „weiterhashen“.
- sha256 2, 4, 5: „31 von 64 Schritten (Runden)“ (now „rundenreduzierte Versionen“),
  „Davies–Meyer-Feed-Forward“, „Designer“.
- sha256 7: translated formula comments are a deliberate deviation from the M4 code listings.

Resolved, changed:

- index 4: „MD-Verstärkung (engl. *MD strengthening*)“.
- index 6: „Einsbit“ replaces „1-Bit“ (text, formula comment, quiz 1).
- index 9, sha512 6: FIPS 180-4 is a „Standard“, not a „Norm“, on all DE hash pages.
- sha512 1: „*indifferentiable* von einem Random Oracle (im Sinne von Maurer et al., TCC 2004)“;
  „ununterscheidbar“ means *indistinguishable*. Maurer–Renner–Holenstein added to the refs (EN+DE).
- sha512 2: „die ersten 384 Bit“ (table, quiz 2) instead of „linke“.
- sha512 4: table header „Zurückgehaltene Zustandsbits“.
- sha512 8: „Random Oracle“ kept English, added to the glossary.
- sha256 1: English term „Nothing up my sleeve“ kept; the gloss „(„nichts im Ärmel“)“ dropped (the
  heading already says it; word limit).
- sha256 8: „wechselt zwischen den Befehlssätzen“.
- Descriptive text no longer addresses the reader with imperatives (index concept „Die Nachricht wird
  … aufgefüllt“, index inside „FIPS 180-4 … hängt ein Einsbit an“, sha512 inside IV generation).
- sha256 quiz 1 feedback: „die ersten 32 Nachkommabits“. Glossary example corrected to
  „√2 = 1,6a09e667…“.

Content fixes (EN and DE): HAC §9.4.1 → §9.3.2 (Fact 9.24, Algorithm 9.26) for MD strengthening and
Damgård's proof; SP 800-107 Rev. 1 marked withdrawn (2022) in refs and text, the 128-bit collision
figure now cites SP 800-57 Part 1 Rev. 5, Table 3 (preimage strength keeps SP 800-107 Table 1), the
three notions cite HAC §9.2.2; Mendel–Nad–Schläffer with its 2⁶⁵·⁵ work; ARMv8 `SHA256H`/`SHA256H2`
„together cover four rounds“. All sections ≤ 150 words.

Still open: sha256 3 („Expansionsschritt“ vs. the sha256 catalog step label).
