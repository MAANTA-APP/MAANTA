/**
 * Safe construction of PostgREST filter strings.
 *
 * `.or()` / `.filter()` are escape hatches in postgrest-js: the string is
 * appended into the query as-is (`PostgrestFilterBuilder.or` does
 * `searchParams.append('or', `(${filters})`)`), and the library's own docblock
 * says the caller "need[s] to make sure they are properly sanitized".
 *
 * PostgREST then parses that string as a grammar — `col.op.value`, conditions
 * separated by `,`, groups in `()`. So a raw user value interpolated into it is
 * not a value at all, it is syntax. `q = "x,role.eq.admin"` stops being a search
 * term and becomes a second condition.
 *
 * The fix is quoting, not stripping. PostgREST allows a filter value to be
 * wrapped in double quotes, and reserved characters inside those quotes are
 * literal. Stripping the reserved set instead would silently mangle real
 * searches — `.` is reserved-adjacent and every email contains one — so quoting
 * is what keeps "search for j.doe@x.com" working while making "search for
 * x,role.eq.admin" a search for that literal string.
 *
 * Inside a quoted value only two characters need escaping: the backslash
 * (the escape character itself) and the double quote (the terminator). Order
 * matters — backslashes first, or the backslash added when escaping a quote
 * gets escaped again.
 *
 * This module exists so there is exactly one place that knows these rules.
 * `postgrest-filter.test.ts` fails if a `.or()` call anywhere in `src/`
 * interpolates a value directly instead of coming through here — the same
 * ratchet the shared comment lexer has (drift D38), because a second private
 * copy of an escaping rule is how the defect comes back.
 */

/**
 * Quote a single value for use in a PostgREST filter expression.
 *
 * Returns the value wrapped in double quotes, with backslashes and double
 * quotes escaped, so reserved characters (`,` `.` `(` `)` `:`) inside it are
 * treated as data rather than grammar.
 */
export function quoteFilterValue(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Build a safe `or=(...)` argument matching `term` against every column with
 * a case-insensitive substring match.
 *
 * Callers pass the bare search term; the `%` wildcards and all quoting happen
 * here, so no call site has to remember either. Column names are the caller's
 * own literals — never user input — and are asserted to be plain identifiers
 * so this helper cannot be turned into the injection vector it exists to close.
 *
 * @example
 *   query.or(ilikeAnyFilter(["full_name", "email"], q))
 */
export function ilikeAnyFilter(columns: readonly string[], term: string): string {
  if (columns.length === 0) {
    throw new Error("ilikeAnyFilter needs at least one column");
  }
  for (const column of columns) {
    if (!/^[a-z_][a-z0-9_]*$/i.test(column)) {
      throw new Error(`Unsafe column identifier in ilikeAnyFilter: ${column}`);
    }
  }
  const value = quoteFilterValue(`%${term}%`);
  return columns.map((column) => `${column}.ilike.${value}`).join(",");
}
