import { useT } from '@cryventure/viz';
import type { SceneId } from './prologueModel.ts';

export type Actor = 'alice' | 'bob' | 'eve';

export function Avatar({ actor }: { actor: Actor }) {
  const t = useT();
  const name = t(`prologue.cast.${actor}`);
  return (
    <span className="cv-avatar" data-actor={actor} aria-hidden="true">
      {name.charAt(0)}
    </span>
  );
}

function Character({ actor, holdsKey = false }: { actor: Actor; holdsKey?: boolean }) {
  const t = useT();
  return (
    <span className="cv-stage__actor" data-actor={actor}>
      <Avatar actor={actor} />
      <span className="cv-stage__name">{t(`prologue.cast.${actor}`)}</span>
      {holdsKey && <span className="cv-stage__key">{t('prologue.xor.legend.key')}</span>}
    </span>
  );
}

const PACKET_GLYPHS: Record<SceneId, string> = { note: 'Aa', encrypt: '▓▒░', decrypt: '▓▒░', choose: '' };

/**
 * Alice and Bob at either end of the wire, Eve tapping it in the middle. The packet travels
 * once per scene; its colour says whether it is readable (plaintext) or not (ciphertext).
 */
export function Stage({ scene }: { scene: SceneId }) {
  const t = useT();
  const encrypted = scene !== 'note';
  const label = t(encrypted ? 'prologue.wire.locked' : 'prologue.wire.clear');
  return (
    <div className="cv-stage" data-scene={scene} role="img" aria-label={`${t('prologue.wire.label')}: ${label}`}>
      <Character actor="alice" holdsKey={encrypted} />
      <div className="cv-stage__wire">
        <span key={scene} className="cv-stage__packet">
          {PACKET_GLYPHS[scene]}
        </span>
        <span className="cv-stage__tap" />
        <span className="cv-stage__eve">
          <Character actor="eve" />
        </span>
      </div>
      <Character actor="bob" holdsKey={encrypted} />
    </div>
  );
}
