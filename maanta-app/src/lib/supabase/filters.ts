/**
 * Safe construction of PostgREST filter *expressions*.
 *
 * Drift row **D58**. The distinction this module exists for:
 *
 *   - `.eq()`, `.ilike()`, `.gt()` and friends take a **value**. supabase-js
 *     percent-encodes it, so a comma or a parenthesis stays inside the value
 *     and cannot change the query's shape. These are safe with raw user input.
 *   - `.or()` and `.and()` take a **filter expression in PostgREST's own DSL**,
 *     as one string. Interpolating user input into it is the same class of
 *     mistake as string-building SQL: a comma ends the current predicate and
 *     begins a new one.
 *
 * `/admin/customers` did the second with a raw `?q=`, against `public.users`
 * with the service-role client. `q = 'x%,role.eq.admin,full_name.ilike.%y'`
 * produced `or=(full_name.ilike.%x%,role.eq.admin,…)` — an attacker-chosen
 * disjunct at the top level of the query.
 *
 * PostgREST's own escape hatch is double quotes: a value wrapped in `"…"` may
 * contain reserved characters, with `\` and `"` backslash-escaped inside. That
 * is what `pgrstQuote` emits, so the value stays a value.
 *
 * **If you are writing a new search, prefer a bound filter.** Reach for `.or()`
 * only when you genuinely need a disjunction across columns, and then build it
 * with `orIlikeAny` rather than a template literal —
 * `src/lib/__tests__/postgrest-filter-injection.test.ts` fails the build on an
 * interpolated `.or()` anywhere under `src/`.
 */

/**
 * Quote a value for use inside a PostgREST filter expression.
 *
 * Always quotes, rather than quoting only when a reserved character is present:
 * a conditional would make the safe path depend on the input, which is exactly
 * the property that makes injection bugs intermittent and hard to spot in
 * review.
 */
export function pgrstQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * `column.ilike.%term%` across several columns, joined as one `or` expression.
 *
 * The `%` wildcards are added here, outside the quoted value, so they keep
 * their `LIKE` meaning while everything the user typed stays literal — a `%`
 * the user types is matched as a wildcard by `ilike` semantics, which is the
 * existing behaviour of these search boxes and is deliberately unchanged.
 *
 * Pass the term already trimmed. Returns null for an empty term so callers can
 * skip the filter entirely rather than emit `or=()`.
 *
 * **`columns` must be a trusted, static list — it is not escaped.** Column
 * names are identifiers in PostgREST's grammar, not values, so quoting them the
 * way `term` is quoted would break the filter rather than secure it. Passing a
 * user-supplied column name here would reintroduce exactly the injection this
 * module exists to close. Every current caller passes a literal array, and it
 * should stay that way. Noted in review of the PR that added this.
 */
export function orIlikeAny(columns: readonly string[], term: string): string | null {
  const trimmed = term.trim();
  if (!trimmed || columns.length === 0) return null;
  const quoted = pgrstQuote(`%${trimmed}%`);
  return columns.map((column) => `${column}.ilike.${quoted}`).join(",");
}
