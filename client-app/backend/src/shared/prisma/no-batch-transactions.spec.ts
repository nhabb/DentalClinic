import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Array-form `prisma.$transaction([...])` is forbidden in this codebase.
 *
 * Prisma dispatches every batch transaction created in one event-loop tick from
 * a single process.nextTick scheduled by whichever request came first. The
 * BEGIN of a later request's batch therefore checks out its connection in the
 * first request's async context, and TenantPool primes it with that request's
 * tenant: the batch reads or writes another clinic's rows. The interactive form
 * `$transaction(async (tx) => ...)` starts its connection in the caller's own
 * context and is safe. (tenant-safety.extension.ts handles the same hazard for
 * batched findUnique calls.)
 */
const SRC = join(__dirname, '..', '..');

/** `$transaction([` or `$transaction(someVariable)`; the callback form starts with `async`/`(`. */
const ARRAY_FORM = /\$transaction\(\s*(\[|[A-Za-z_$][\w$]*\s*\))/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory())
      return name === 'generated' ? [] : sourceFiles(full);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('tenant safety: no array-form $transaction', () => {
  it('every $transaction in src/ uses the interactive callback form', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(ARRAY_FORM)) {
        const line = text.slice(0, match.index).split('\n').length;
        offenders.push(`${relative(SRC, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the pattern catches both array literals and variables', () => {
    expect('x.$transaction([a, b])'.match(ARRAY_FORM)).toHaveLength(1);
    expect('x.$transaction(ops)'.match(ARRAY_FORM)).toHaveLength(1);
    expect('x.$transaction(async (tx) => 1)'.match(ARRAY_FORM)).toBeNull();
    expect('x.$transaction((tx) => 1, opts)'.match(ARRAY_FORM)).toBeNull();
  });
});
