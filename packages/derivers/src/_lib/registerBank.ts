/**
 * What each physical vector register holds while a listing runs: the AES state (a version, bumped
 * by every instruction that produces a new state) or round key i. Compilers rename registers
 * (the ARM listings move the state through v0/v1/v2), so derivers track contents, not names.
 */
export type RegisterContent = { kind: 'state'; version: number } | { kind: 'key'; index: number };

export class RegisterBank {
  private readonly contents = new Map<string, RegisterContent>();
  private stateVersion = -1;

  /** `register` now holds a freshly produced state (the newest version). */
  writeState(register: string): void {
    this.stateVersion += 1;
    this.contents.set(register, { kind: 'state', version: this.stateVersion });
  }

  /** `register` now holds round key `index`. */
  writeKey(register: string, index: number): void {
    this.contents.set(register, { kind: 'key', index });
  }

  /** Whether `register` holds the newest state (not a stale copy). */
  holdsCurrentState(register: string): boolean {
    const content = this.contents.get(register);
    return content?.kind === 'state' && content.version === this.stateVersion;
  }

  /** Whether `register` holds round key `index`. */
  holdsKey(register: string, index: number): boolean {
    const content = this.contents.get(register);
    return content?.kind === 'key' && content.index === index;
  }
}
