/**
 * Prisma client extension that keeps unique lookups tenant-safe.
 *
 * Prisma batches `findUnique` calls that happen in the same event-loop tick into
 * one `WHERE id IN (...)` statement, even when they come from different HTTP
 * requests. Under row-level security that statement runs with the tenant
 * settings of whichever request created the batch, so another tenant's lookup
 * would silently return nothing. `findFirst` is never batched and returns the
 * same row for a unique `where`, so unique lookups outside a transaction are
 * rewritten to it. Inside a transaction batching is already per-transaction.
 */

type UniqueReadOperation = 'findUnique' | 'findUniqueOrThrow';

const REWRITE: Record<UniqueReadOperation, 'findFirst' | 'findFirstOrThrow'> = {
  findUnique: 'findFirst',
  findUniqueOrThrow: 'findFirstOrThrow',
};

/** Shape of the argument Prisma passes to a `$allOperations` query hook. */
export interface AllOperationsParams {
  model: string;
  operation: string;
  args: any;
  query: (args: any) => Promise<unknown>;
  /** Undocumented but stable: the request internals, including the enclosing transaction. */
  __internalParams?: { transaction?: unknown };
}

/** True when the operation should be rewritten to its non-batched equivalent. */
export function shouldRewriteToFindFirst(
  params: AllOperationsParams,
): params is AllOperationsParams & {
  operation: UniqueReadOperation;
} {
  return params.operation in REWRITE && !params.__internalParams?.transaction;
}

/**
 * `findUnique` accepts compound-unique selectors such as
 * `{ branch_id_sku: { branch_id, sku } }`; `findFirst` wants the plain fields.
 * Spread those objects when the key is the underscore-joined list of its fields.
 */
export function flattenCompoundUnique<
  T extends Record<string, unknown> | undefined,
>(where: T): T {
  if (!where) return where;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (isCompoundUniqueSelector(key, value)) {
      Object.assign(out, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function isCompoundUniqueSelector(
  key: string,
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype &&
    key === Object.keys(value).join('_')
  );
}

/**
 * Builds the extension. `base` is the unextended client whose model delegates
 * run the rewritten query (so the rewrite does not re-enter this hook).
 */
export function tenantSafetyExtension(base: any) {
  return {
    name: 'tenant-safety',
    query: {
      $allModels: {
        async $allOperations(params: AllOperationsParams) {
          if (!shouldRewriteToFindFirst(params))
            return params.query(params.args);
          const { model, operation, args } = params;
          const where = flattenCompoundUnique(args?.where);
          return base[model][REWRITE[operation]]({ ...args, where });
        },
      },
    },
  };
}
