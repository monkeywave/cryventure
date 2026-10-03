import { describe, expect, it } from 'vitest';
import { isLabViewsOption, viewsToShow } from './labViews.ts';

const views = [{ id: 'state' }, { id: 'narration' }, { id: 'instructions' }, { id: 'memory' }];

describe('viewsToShow', () => {
  it('offers every view by default ("all")', () => {
    expect(viewsToShow(views, 'state|narration', 'all')).toBe(views);
    expect(viewsToShow(views, undefined, undefined)).toBe(views);
  });

  it('keeps only the views named in the layout for "layout-only" (sizes and unknown ids ignored)', () => {
    expect(viewsToShow(views, 'state:65|narration:35|nope', 'layout-only').map((view) => view.id)).toEqual(['state', 'narration']);
  });

  it('falls back to every view when the layout names none of them', () => {
    expect(viewsToShow(views, 'nope', 'layout-only')).toBe(views);
  });
});

describe('isLabViewsOption', () => {
  it('accepts "all" and "layout-only" only', () => {
    expect(isLabViewsOption('all')).toBe(true);
    expect(isLabViewsOption('layout-only')).toBe(true);
    expect(isLabViewsOption('layout')).toBe(false);
    expect(isLabViewsOption(undefined)).toBe(false);
  });
});
