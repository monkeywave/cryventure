import { describe, expect, it } from 'vitest';
import { RegisterBank } from './registerBank.ts';

describe('RegisterBank', () => {
  it('tracks round keys per register', () => {
    const bank = new RegisterBank();
    bank.writeKey('v1', 3);
    expect([bank.holdsKey('v1', 3), bank.holdsKey('v1', 4), bank.holdsKey('v2', 3)]).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('knows only the newest state as current (renamed registers keep stale copies)', () => {
    const bank = new RegisterBank();
    bank.writeState('v0');
    expect(bank.holdsCurrentState('v0')).toBe(true);
    bank.writeState('v1');
    expect([bank.holdsCurrentState('v0'), bank.holdsCurrentState('v1')]).toEqual([false, true]);
  });

  it('forgets the state when a key overwrites its register', () => {
    const bank = new RegisterBank();
    bank.writeState('xmm1');
    bank.writeKey('xmm1', 1);
    expect([bank.holdsCurrentState('xmm1'), bank.holdsKey('xmm1', 1)]).toEqual([false, true]);
  });
});
