import type { CSSProperties } from 'react';
import { byteToHex, toHex } from '@cryventure/core';
import { useT } from '@cryventure/viz';
import { bytesToNote, noiseGlyphs } from './noteBytes.ts';
import { Avatar } from './Stage.tsx';

/** Colour role of a byte row; maps to the --cv-* data-role tokens. */
export type ByteRole = 'plaintext' | 'key' | 'ciphertext';

export function HexLine({ bytes, role }: { bytes: Uint8Array; role: ByteRole }) {
  return (
    <code className="cv-hex" data-role={role}>
      {toHex(bytes, { group: 1 })}
    </code>
  );
}

interface XorTilesProps {
  input: Uint8Array;
  inputRole: ByteRole;
  keyBytes: Uint8Array;
  output: Uint8Array;
  outputRole: ByteRole;
  /** Changing it restarts the reveal animation (e.g. after a new key). */
  revealId: string;
}

function LegendSwatch({ role }: { role: ByteRole }) {
  const t = useT();
  const label = role === 'plaintext' ? 'prologue.xor.legend.note' : role === 'key' ? 'prologue.xor.legend.key' : 'prologue.xor.legend.cipher';
  return (
    <span className="cv-xor__swatch" data-role={role}>
      {t(label)}
    </span>
  );
}

/** One tile per byte: input ⊕ key = output, revealed left to right. */
export function XorTiles({ input, inputRole, keyBytes, output, outputRole, revealId }: XorTilesProps) {
  const t = useT();
  return (
    <div className="cv-xor">
      <p className="cv-xor__legend" aria-hidden="true">
        <LegendSwatch role={inputRole} />
        <span className="cv-xor__op">⊕</span>
        <LegendSwatch role="key" />
        <span className="cv-xor__op">=</span>
        <LegendSwatch role={outputRole} />
      </p>
      <ol key={revealId} className="cv-xor__tiles">
        {Array.from(output, (byte, index) => {
          const [a, b, result] = [byteToHex(input[index] ?? 0), byteToHex(keyBytes[index] ?? 0), byteToHex(byte)];
          return (
            <li key={index} className="cv-xor__tile" style={{ '--i': index } as CSSProperties} aria-label={t('prologue.xor.byte', { index: index + 1, a, b, result })}>
              <span aria-hidden="true" data-role={inputRole}>
                {a}
              </span>
              <span aria-hidden="true" data-role="key">
                {b}
              </span>
              <span aria-hidden="true" className="cv-xor__result" data-role={outputRole}>
                {result}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EveReading({ bytes, readable }: { bytes: Uint8Array; readable: boolean }) {
  const t = useT();
  if (readable) return <q className="cv-eve__text">{bytesToNote(bytes)}</q>;
  return (
    <span className="cv-eve__text cv-eve__text--noise">
      <span aria-hidden="true">{noiseGlyphs(bytes).join('')}</span>
      <span className="sr-only">{t('prologue.eve.noise')}</span>
    </span>
  );
}

/** Eve's intercept: the bytes on the wire and what she makes of them as text. */
export function EveView({ bytes, readable, live = false }: { bytes: Uint8Array; readable: boolean; live?: boolean }) {
  const t = useT();
  return (
    <figure className="cv-eve" data-readable={readable}>
      <figcaption className="cv-eve__caption">
        <Avatar actor="eve" />
        {t('prologue.eve.title')}
      </figcaption>
      <div className="cv-eve__row" aria-live={live ? 'polite' : undefined}>
        <span className="cv-eve__label">{t('prologue.eve.reads')}</span>
        <EveReading bytes={bytes} readable={readable} />
      </div>
      <div className="cv-eve__row">
        <span className="cv-eve__label">{t('prologue.eve.hex')}</span>
        <HexLine bytes={bytes} role={readable ? 'plaintext' : 'ciphertext'} />
      </div>
    </figure>
  );
}
