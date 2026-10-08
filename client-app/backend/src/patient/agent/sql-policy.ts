import { parse } from 'pgsql-ast-parser';

/**
 * Decides whether a piece of SQL from the model is a plain read, by looking
 * at its syntax tree rather than its text.
 *
 * Text filters are not a boundary: `"set_config"(…)`, `set_config/**／(…)` or
 * a subquery can all hide what a regex looks for. Parsing gives one answer for
 * every spelling. The rules are allowlists, so anything new or unparseable is
 * refused until someone decides it is safe:
 *   - exactly one statement, and only SELECT / WITH / UNION / VALUES kinds
 *   - no FOR UPDATE / SHARE locks
 *   - every table lives in `public` and is returned for a permission check
 *   - every function call is a known read-only function
 */

export type SqlAnalysis =
  | { ok: true; tables: string[] }
  | { ok: false; reason: string };

/** Statement kinds that only read. Everything else the parser knows is refused. */
const READ_KINDS = new Set([
  'select',
  'with',
  'with recursive',
  'union',
  'union all',
  'intersect',
  'intersect all',
  'except',
  'except all',
  'values',
]);

/**
 * Node kinds that are statements rather than expressions. A node with one of
 * these kinds that is not in READ_KINDS means the SQL writes, changes
 * settings or touches the schema somewhere (a CTE can hold a DELETE).
 */
const STATEMENT_KIND =
  /^(select|with|with recursive|union|union all|intersect|intersect all|except|except all|values|insert|update|delete|create|alter|drop|truncate|set|show|begin|commit|rollback|start transaction|prepare|deallocate|do|raise|comment|refresh|tablespace)\b/;

/**
 * Functions the assistant may call: aggregates, maths, text, dates, JSON,
 * arrays, window functions and quantifiers. Nothing here changes state, reads
 * files, runs SQL from a string or touches sequences.
 */
export const ALLOWED_FUNCTIONS: ReadonlySet<string> = new Set([
  // quantifiers and predicates
  'any',
  'all',
  'some',
  'exists',
  'coalesce',
  'nullif',
  'greatest',
  'least',
  'num_nonnulls',
  'num_nulls',
  // aggregates and statistics
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'string_agg',
  'array_agg',
  'json_agg',
  'jsonb_agg',
  'json_object_agg',
  'jsonb_object_agg',
  'bool_and',
  'bool_or',
  'every',
  'stddev',
  'stddev_pop',
  'stddev_samp',
  'variance',
  'var_pop',
  'var_samp',
  'percentile_cont',
  'percentile_disc',
  'mode',
  'corr',
  // window
  'row_number',
  'rank',
  'dense_rank',
  'percent_rank',
  'cume_dist',
  'ntile',
  'lag',
  'lead',
  'first_value',
  'last_value',
  'nth_value',
  // maths
  'abs',
  'round',
  'ceil',
  'ceiling',
  'floor',
  'trunc',
  'mod',
  'power',
  'sqrt',
  'sign',
  'width_bucket',
  'div',
  'exp',
  'ln',
  'log',
  'pi',
  // text
  'lower',
  'upper',
  'initcap',
  'length',
  'char_length',
  'character_length',
  'substring',
  'substr',
  'left',
  'right',
  'trim',
  'ltrim',
  'rtrim',
  'btrim',
  'replace',
  'concat',
  'concat_ws',
  'position',
  'strpos',
  'split_part',
  'lpad',
  'rpad',
  'repeat',
  'reverse',
  'format',
  'regexp_replace',
  'regexp_matches',
  'regexp_match',
  'starts_with',
  'translate',
  'to_char',
  'to_number',
  'to_date',
  'to_timestamp',
  'text',
  'ascii',
  'chr',
  // dates and times
  'now',
  'current_date',
  'current_time',
  'current_timestamp',
  'localtime',
  'localtimestamp',
  'date_trunc',
  'date_part',
  'date_bin',
  'extract',
  'age',
  'make_date',
  'make_time',
  'make_timestamp',
  'make_interval',
  'justify_days',
  'justify_hours',
  'justify_interval',
  'timezone',
  'isfinite',
  'date',
  'generate_series',
  'clock_timestamp',
  'statement_timestamp',
  'transaction_timestamp',
  'timeofday',
  // json
  'json_build_object',
  'jsonb_build_object',
  'json_build_array',
  'jsonb_build_array',
  'to_json',
  'to_jsonb',
  'row_to_json',
  'json_array_length',
  'jsonb_array_length',
  'json_extract_path',
  'jsonb_extract_path',
  'json_extract_path_text',
  'jsonb_extract_path_text',
  'jsonb_array_elements',
  'json_array_elements',
  'jsonb_array_elements_text',
  'json_array_elements_text',
  'jsonb_each',
  'json_each',
  'jsonb_each_text',
  'json_each_text',
  'jsonb_typeof',
  'json_typeof',
  'jsonb_object_keys',
  'json_object_keys',
  'jsonb_pretty',
  'jsonb_strip_nulls',
  // arrays
  'unnest',
  'array_length',
  'array_to_string',
  'string_to_array',
  'cardinality',
  'array_position',
  'array_positions',
  'array_remove',
  'array_upper',
  'array_lower',
  'array_append',
  'array_prepend',
  'array_cat',
  'array_fill',
  'array_ndims',
  'array_dims',
  // casting helpers
  'cast',
  'int',
  'integer',
  'bigint',
  'numeric',
  'float8',
  'float4',
  'bool',
  'boolean',
  'interval',
  'varchar',
]);

const MAX_SQL_LENGTH = 8_000;

/**
 * Why `sql` is not a single permitted SELECT, or the tables it reads.
 * `knownTables` are the real table names: a CTE may not borrow one of them,
 * because the reference to the real table inside its body would then look
 * like a reference to the CTE and escape the permission check.
 */
export function analyzeSelect(
  sql: string,
  knownTables: ReadonlySet<string> = new Set(),
): SqlAnalysis {
  if (sql.length > MAX_SQL_LENGTH) {
    return { ok: false, reason: 'Query is too long.' };
  }

  let statements: unknown[];
  try {
    statements = parse(sql) as unknown[];
  } catch (err) {
    const message = (err as Error).message.split('\n')[0];
    return { ok: false, reason: `Could not parse the SQL: ${message}` };
  }
  if (statements.length !== 1) {
    return { ok: false, reason: 'Exactly one SELECT statement is allowed.' };
  }

  const tables = new Set<string>();
  const cteNames = new Set<string>();
  const refused: string[] = [];

  walk(statements[0], (node) => {
    const kind = node.type;
    if (typeof kind !== 'string') return;

    if (STATEMENT_KIND.test(kind) && !READ_KINDS.has(kind)) {
      refused.push(`statement kind "${kind}"`);
      return;
    }
    if (
      (kind === 'with' || kind === 'with recursive') &&
      Array.isArray(node.bind)
    ) {
      for (const b of node.bind as { alias?: { name?: string } }[]) {
        if (b.alias?.name) cteNames.add(b.alias.name.toLowerCase());
      }
    }
    if (kind === 'select' && node.for !== undefined) {
      refused.push('row locking (FOR UPDATE / FOR SHARE)');
    }
    if (kind === 'table') {
      const name = node.name as { name?: string; schema?: string } | undefined;
      if (!name?.name) return;
      if (name.schema && name.schema.toLowerCase() !== 'public') {
        refused.push(`schema "${name.schema}"`);
      } else {
        tables.add(name.name.toLowerCase());
      }
    }
    if (kind === 'call') {
      const fn = node.function as
        | { name?: string; schema?: string }
        | undefined;
      const fnName = fn?.name?.toLowerCase() ?? '?';
      const schema = fn?.schema?.toLowerCase();
      if (
        (schema && schema !== 'pg_catalog') ||
        !ALLOWED_FUNCTIONS.has(fnName)
      ) {
        refused.push(`function "${schema ? `${schema}.` : ''}${fnName}"`);
      }
    }
  });

  for (const alias of cteNames) {
    if (knownTables.has(alias))
      refused.push(`a WITH query named like the table "${alias}"`);
  }
  if (refused.length > 0) {
    return {
      ok: false,
      reason: `Not allowed in a query: ${[...new Set(refused)].join(', ')}.`,
    };
  }
  // A CTE's own name is not a table; its body was checked on the way.
  return { ok: true, tables: [...tables].filter((t) => !cteNames.has(t)) };
}

type Node = Record<string, unknown>;

/** Depth-first visit of every object in the syntax tree. */
function walk(value: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (value && typeof value === 'object') {
    visit(value as Node);
    for (const child of Object.values(value as Node)) walk(child, visit);
  }
}
