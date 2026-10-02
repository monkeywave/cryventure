import { describe, expect, it } from 'vitest';
import { messageParityProblems } from '../testing/messageParity.ts';
import { vizMessages } from './messages.ts';

describe('viz i18n parity', () => {
  it('EN and DE have identical keys, matching {{params}} and no empty values', () => {
    expect(messageParityProblems(vizMessages.en, vizMessages.de)).toEqual([]);
  });
});
