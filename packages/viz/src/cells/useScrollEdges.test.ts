import { describe, expect, it } from 'vitest';
import { blockScrollEdges, scrollEdges } from './useScrollEdges.ts';

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

describe('blockScrollEdges', () => {
  it('reports hidden content above and below a vertical scroller', () => {
    expect(blockScrollEdges({ scrollTop: 0, scrollHeight: 300, clientHeight: 300 })).toEqual({ top: false, bottom: false });
    expect(blockScrollEdges({ scrollTop: 0, scrollHeight: 900, clientHeight: 300 })).toEqual({ top: false, bottom: true });
    expect(blockScrollEdges({ scrollTop: 250, scrollHeight: 900, clientHeight: 300 })).toEqual({ top: true, bottom: true });
    expect(blockScrollEdges({ scrollTop: 599.5, scrollHeight: 900, clientHeight: 300 })).toEqual({ top: true, bottom: false });
  });
});
