import { toHex, type PrimitiveManifest, type TraceBundle } from '@cryventure/core';
import { useLab, useT } from '@cryventure/viz';
import { outputLabelKey } from '../../labs/paramFields.ts';

const BYTES_PER_GROUP = 4;

/** Stable empty selection result, so the selector never returns a fresh object. */
const NO_OUTPUT: TraceBundle['output'] = {};

/** The producer's final outputs (e.g. the ciphertext) as grouped hex, labelled by `manifest.outputs` (else the raw name). */
export function OutputPanel({ producer }: { producer: Pick<PrimitiveManifest, 'outputs'> }) {
  const t = useT();
  const output = useLab((state) => state.bundle?.output ?? NO_OUTPUT);
  const label = (name: string) => {
    const key = outputLabelKey(producer, name);
    return key === undefined ? name : t(key);
  };
  return (
    <section className="cv-output" aria-label={t('ui.lab.output.title')}>
      <dl className="cv-output__list">
        {Object.entries(output).map(([name, bytes]) => (
          <div key={name} className="cv-output__item">
            <dt>{label(name)}</dt>
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
