import { toHex, type PrimitiveManifest } from '@cryventure/core';
import { useLab, useT } from '@cryventure/viz';
import { outputLabelKey } from '../../labs/paramFields.ts';

const BYTES_PER_GROUP = 4;

/** The producer's final outputs (e.g. the ciphertext) as grouped hex. */
export function OutputPanel({ producer }: { producer: Pick<PrimitiveManifest, 'i18nNamespace'> }) {
  const t = useT();
  const output = useLab((state) => state.bundle?.output ?? {});
  return (
    <section className="cv-output" aria-label={t('ui.lab.output.title')}>
      <dl className="cv-output__list">
        {Object.entries(output).map(([name, bytes]) => (
          <div key={name} className="cv-output__item">
            <dt>{t(outputLabelKey(producer, name))}</dt>
            <dd>
              <output className="cv-output__value" data-testid={`lab-output-${name}`}>
                {toHex(bytes, { group: BYTES_PER_GROUP })}
              </output>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
