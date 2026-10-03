import { describe, expect, it } from 'vitest';
import { scrollEdges } from './useScrollEdges.ts';

describe('scrollEdges', () => {
  it('reports hidden content past each edge', () => {
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toEqual({
      start: false,
      end: false,
    });
    expect(scrollEdges({ scrollLeft: 0, scrollWidth: 700, clientWidth: 300 })).toEqual({
      start: false,
      end: true,
    });
    expect(scrollEdges({ scrollLeft: 200, scrollWidth: 700, clientWidth: 300 })).toEqual({
      start: true,
      end: true,
    });
    expect(scrollEdges({ scrollLeft: 399.6, scrollWidth: 700, clientWidth: 300 })).toEqual({
      start: true,
      end: false,
    });
  });
});
