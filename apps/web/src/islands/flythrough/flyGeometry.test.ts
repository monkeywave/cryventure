import { describe, expect, it } from 'vitest';
import { CELL_HEIGHT, CELL_WIDTH, NARROW_BELOW_PX, NARROW_GEOMETRY, WIDE_GEOMETRY, geometryFor, type FlyGeometry } from './flyGeometry.ts';

const SLOTS = Array.from({ length: 16 }, (_, index) => index);

function allBoxes(geometry: FlyGeometry) {
  return [...SLOTS.map((i) => geometry.matrixCell(i)), ...SLOTS.map((i) => geometry.rowSlot('register', i)), ...SLOTS.map((i) => geometry.rowSlot('ram', i))];
}

describe('fly-through geometry', () => {
  it.each([WIDE_GEOMETRY, NARROW_GEOMETRY])('$name keeps every slot inside the viewBox without overlaps', (geometry) => {
    const boxes = allBoxes(geometry);
    for (const { x, y } of boxes) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + CELL_WIDTH).toBeLessThanOrEqual(geometry.width);
      expect(y + CELL_HEIGHT).toBeLessThanOrEqual(geometry.height);
    }
    const overlaps = boxes.some((a, i) => boxes.some((b, j) => i < j && Math.abs(a.x - b.x) < CELL_WIDTH && Math.abs(a.y - b.y) < CELL_HEIGHT));
    expect(overlaps).toBe(false);
  });

  it('wraps the register and RAM rows into two lines of 8 on narrow containers', () => {
    expect(NARROW_GEOMETRY.rowSlot('register', 8).y).toBeGreaterThan(NARROW_GEOMETRY.rowSlot('register', 7).y);
    expect(WIDE_GEOMETRY.rowSlot('register', 8).y).toBe(WIDE_GEOMETRY.rowSlot('register', 7).y);
  });

  it('never scales the drawing below 1:1 on a 390 px phone, so 11-unit text stays at least 11 px', () => {
    // 390 px viewport − 2 × 16 px page gutter − 2 × 16 px card padding − 2 × 1 px border.
    const phoneContentPx = 390 - 32 - 32 - 2;
    expect(NARROW_GEOMETRY.width).toBeLessThanOrEqual(phoneContentPx);
  });

  it('picks the layout by container width; unmeasured counts as wide', () => {
    expect(geometryFor(undefined)).toBe(WIDE_GEOMETRY);
    expect(geometryFor(NARROW_BELOW_PX - 1)).toBe(NARROW_GEOMETRY);
    expect(geometryFor(NARROW_BELOW_PX)).toBe(WIDE_GEOMETRY);
  });
});
