/** The symbolic vector registers of one listing walk: what each register holds, as `T`. */
export class RegisterFile<T> {
  private readonly contents = new Map<string, T>();

  /** What `register` holds; throws when nothing was written to it (or it was forgotten). */
  read(register: string): T {
    const content = this.contents.get(register);
    if (content === undefined) throw new Error(`${register} is read before it is written`);
    return content;
  }

  write(register: string, content: T): void {
    this.contents.set(register, content);
  }

  forget(register: string): void {
    this.contents.delete(register);
  }
}
