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
2. **„Teilschritt {{ordinal}}“** (AES scope label) vs. „Operation {{ordinal}}“ (viz scope label):
   should both say „Operation“? Kept as is because a primitives test requires DE ≠ EN.
3. **„Knack es“** as the part name for *Break it*: fine, or „Brich es“ / „Angriff“?
4. **„Spielwiese“** for *Playground* and **„Erzählmodus“** for *Story*: natural for the audience?
5. **„Nichts im Ärmel?“** as a heading for *Nothing up the sleeve?*: keep the image, or use
   „Nothing up my sleeve?“ with a gloss?
6. **„Chiffrierschlüssel“** (key-expansion page) vs. plain „Schlüssel“.
7. **Narrow no-break spaces** in „z. B.“ / „16 Byte“: worth enforcing (currently plain spaces)?
8. **„verwürfelt“** in the 404 text („vielleicht hat Eve den Link verwürfelt“) – a pun on the
   technical term (*scrambling*); does it land?
9. Lens names (no UI yet): „Erzählung / Technik / Kryptografie“ proposed in the glossary.
