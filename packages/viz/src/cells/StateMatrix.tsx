import type { RegionSpec } from '@cryventure/core';
import { useT } from '../i18n/I18nProvider.tsx';
import { ByteGrid } from './ByteGrid.tsx';
import type { GridHighlight } from './gridLayout.ts';

export interface StateMatrixProps {
  region: RegionSpec<string>;
  values: readonly number[];
  highlights?: readonly GridHighlight[];
}

/** A 2-D region (e.g. the AES 4×4 state) as a labelled `ByteGrid` using the region's shape and order. */
export function StateMatrix({ region, values, highlights }: StateMatrixProps) {
  const t = useT();
  const [rows = 1, cols = values.length] = region.shape;
  return (
    <ByteGrid
      values={values}
      shape={[rows, cols]}
      order={region.order ?? 'row-major'}
      elem={region.elem}
      highlights={highlights}
      label={t(region.labelKey)}
    />
  );
}
