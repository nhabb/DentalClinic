/**
 * Typed access to the arguments the model sends with a tool call.
 *
 * The model's JSON is untrusted input: a field may be missing, the wrong type
 * ("12" instead of 12) or garbage. Each accessor coerces what it reasonably
 * can and otherwise returns undefined (or the given default), so a service
 * never receives a value of the wrong type. `id()` throws a readable error
 * that is sent back to the model so it can correct itself.
 */
export class ToolArgs {
  constructor(private readonly raw: Record<string, unknown>) {}

  static parse(json: string): ToolArgs {
    try {
      const parsed: unknown = JSON.parse(json || '{}');
      return new ToolArgs(
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {},
      );
    } catch {
      return new ToolArgs({});
    }
  }

  /** First present key wins: tools keep old argument names as aliases. */
  private first(keys: string[]): unknown {
    for (const key of keys) {
      const value = this.raw[key];
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  }

  str(...keys: string[]): string | undefined {
    const v = this.first(keys);
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return undefined;
  }

  strOr(fallback: string, ...keys: string[]): string {
    return this.str(...keys) ?? fallback;
  }

  num(...keys: string[]): number | undefined {
    const v = this.first(keys);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  numOr(fallback: number, ...keys: string[]): number {
    return this.num(...keys) ?? fallback;
  }

  /** Database ids. Throws a readable error when the model sent none. */
  id(...keys: string[]): bigint {
    const v = this.first(keys);
    if (typeof v === 'bigint') return v;
    if (
      (typeof v === 'number' && Number.isInteger(v)) ||
      (typeof v === 'string' && /^\d+$/.test(v.trim()))
    ) {
      return BigInt(typeof v === 'string' ? v.trim() : v);
    }
    throw new Error(`Argument "${keys[0]}" must be a whole-number id`);
  }

  idOrUndefined(...keys: string[]): bigint | undefined {
    return this.first(keys) === undefined ? undefined : this.id(...keys);
  }

  bool(...keys: string[]): boolean | undefined {
    const v = this.first(keys);
    if (typeof v === 'boolean') return v;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return undefined;
  }
}
