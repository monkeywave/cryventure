import { describe, expect, it } from 'vitest';
import { nextScene, previousScene, prologueView, SCENES, sceneNumber } from './prologueModel.ts';

describe('scene navigation', () => {
  it('walks forward and backward through all scenes', () => {
    expect(nextScene('note')).toBe('encrypt');
    expect(nextScene('decrypt')).toBe('choose');
    expect(previousScene('encrypt')).toBe('note');
  });

  it('stops at both ends', () => {
    expect(previousScene('note')).toBe('note');
    expect(nextScene('choose')).toBe('choose');
  });

  it('numbers scenes from one', () => {
    expect(SCENES.map(sceneNumber)).toEqual([1, 2, 3, 4]);
  });
});

describe('prologueView', () => {
  it('shows the tour to a first-time learner', () => {
    expect(prologueView('visit', false)).toBe('tour');
  });

  it('welcomes back a learner who already finished', () => {
    expect(prologueView('visit', true)).toBe('welcomeBack');
  });

  it('shows the tour again while replaying', () => {
    expect(prologueView('replay', true)).toBe('tour');
    expect(prologueView('replay', false)).toBe('tour');
  });

  it('confirms right after a lens was chosen', () => {
    expect(prologueView('done', true)).toBe('done');
    expect(prologueView('done', false)).toBe('done');
  });
});
