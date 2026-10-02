import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createFixtureBundle } from '../testing/fixtureBundle.ts';
import { renderLab } from '../testing/renderLab.tsx';
import { keyToAction } from './useLabKeyboard.ts';

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({ key: k, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

describe('keyToAction', () => {
  const div = document.createElement('div');

  it('maps the player shortcuts', () => {
    expect(keyToAction(key('ArrowLeft'), div)).toBe('prev');
    expect(keyToAction(key('ArrowRight'), div)).toBe('next');
    expect(keyToAction(key(' '), div)).toBe('togglePlay');
    expect(keyToAction(key('Home'), div)).toBe('first');
    expect(keyToAction(key('End'), div)).toBe('last');
  });

  it('ignores other keys and modified keys', () => {
    expect(keyToAction(key('a'), div)).toBeNull();
    expect(keyToAction(key('ArrowRight', { ctrlKey: true }), div)).toBeNull();
  });

  it('leaves keys to text fields and sliders, and Space to buttons', () => {
    expect(keyToAction(key('ArrowRight'), document.createElement('input'))).toBeNull();
    expect(keyToAction(key(' '), document.createElement('button'))).toBeNull();
    expect(keyToAction(key('ArrowRight'), document.createElement('button'))).toBe('next');
  });
});

describe('useLabKeyboard (via LabRoot)', () => {
  it('drives the player only while focus is inside the lab', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const { store } = renderLab(<div tabIndex={0} data-testid="inside" />, { bundle: createFixtureBundle() });
    const inside = screen.getByTestId('inside');

    fireEvent.keyDown(inside, { key: 'ArrowRight' });
    fireEvent.keyDown(inside, { key: 'ArrowRight' });
    expect(store.getState().step).toBe(1);
    fireEvent.keyDown(inside, { key: 'ArrowLeft' });
    expect(store.getState().step).toBe(0);
    fireEvent.keyDown(inside, { key: 'End' });
    expect(store.getState().step).toBe(2);
    fireEvent.keyDown(inside, { key: 'Home' });
    expect(store.getState().step).toBe(-1);
    fireEvent.keyDown(inside, { key: ' ' });
    expect(store.getState().playing).toBe(true);

    fireEvent.keyDown(outside, { key: 'End' });
    expect(store.getState().step).toBe(-1);
    outside.remove();
  });

  it('skips events another handler already consumed', () => {
    const { store } = renderLab(<div tabIndex={0} data-testid="inside" onKeyDown={(event) => event.preventDefault()} />, { bundle: createFixtureBundle() });
    fireEvent.keyDown(screen.getByTestId('inside'), { key: 'ArrowRight' });
    expect(store.getState().step).toBe(-1);
  });
});
