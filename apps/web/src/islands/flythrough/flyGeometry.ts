import { BLOCK_BYTES, WORD_BYTES, matrixCell, type FlySlots } from './flyThroughModel.ts';

/**
 * SVG layouts of the fly-through (user units). `wide` puts the 16 lanes in one row; `narrow` (phones)
 * wraps the register and RAM rows into two rows of 8, so the bytes stay readable at 390 px. The narrow
 * drawing never shrinks below its own width (`FlyDiagram` sets a minimum), so its text stays ≥ 11 px.
 */

export const CELL_WIDTH = 32;
export const CELL_HEIGHT = 28;
const MATRIX_PITCH_X = 44;
const MATRIX_PITCH_Y = 34;
const MATRIX_Y0 = 36;

export interface RowGeometry {
  /** Baseline of the row's title. */
  labelY: number;
  /** Top of the first line of slots. */
  y: number;
  /** Distance between the lines of a wrapped row. */
  linePitch: number;
}

export interface FlyGeometry extends FlySlots {
  name: 'wide' | 'narrow';
  width: number;
  height: number;
  /** Left edge of the row titles. */
  labelX: number;
  matrixLabelY: number;
  register: RowGeometry;
  ram: RowGeometry;
}

interface GeometrySpec {
  name: FlyGeometry['name'];
  width: number;
  height: number;
  /** Slots per line (16 or 8). */
  perLine: number;
  x0: number;
  pitch: number;
  groupGap: number;
  register: RowGeometry;
  ram: RowGeometry;
}

function createGeometry(spec: GeometrySpec): FlyGeometry {
  const matrixX0 = spec.width / 2 - 2 * MATRIX_PITCH_X + (MATRIX_PITCH_X - CELL_WIDTH) / 2;
  const rows = { register: spec.register, ram: spec.ram };
  return {
    name: spec.name,
    width: spec.width,
    height: spec.height,
    labelX: spec.x0,
    matrixLabelY: MATRIX_Y0 - 14,
    register: spec.register,
    ram: spec.ram,
    matrixCell(index) {
      const { row, col } = matrixCell(index);
      return { x: matrixX0 + col * MATRIX_PITCH_X, y: MATRIX_Y0 + row * MATRIX_PITCH_Y };
    },
    rowSlot(row, slot) {
      const column = slot % spec.perLine;
      const line = Math.floor(slot / spec.perLine);
      return { x: spec.x0 + column * spec.pitch + Math.floor(column / WORD_BYTES) * spec.groupGap, y: rows[row].y + line * rows[row].linePitch };
    },
  };
}

export const WIDE_GEOMETRY = createGeometry({
  name: 'wide',
  width: 640,
  height: 420,
  perLine: BLOCK_BYTES,
  x0: 24,
  pitch: 36,
  groupGap: 8,
  register: { labelY: 206, y: 236, linePitch: 0 },
  ram: { labelY: 322, y: 352, linePitch: 0 },
});

export const NARROW_GEOMETRY = createGeometry({
  name: 'narrow',
  // Narrower than a 390 px phone's content box, so the drawing renders at 1:1 or larger there.
  width: 300,
  height: 472,
  perLine: BLOCK_BYTES / 2,
  x0: 4,
  pitch: 36,
  groupGap: 6,
  register: { labelY: 196, y: 222, linePitch: 50 },
  ram: { labelY: 330, y: 356, linePitch: 64 },
});

/** Below this container width (CSS px) the narrow layout is used. */
export const NARROW_BELOW_PX = 560;

export function geometryFor(containerWidth: number | undefined): FlyGeometry {
  return containerWidth !== undefined && containerWidth > 0 && containerWidth < NARROW_BELOW_PX ? NARROW_GEOMETRY : WIDE_GEOMETRY;
}
