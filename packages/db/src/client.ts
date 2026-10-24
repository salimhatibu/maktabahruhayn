/**
 * The slice of the D1 API this package uses. Declaring it structurally keeps
 * the package dependency-free: a real `D1Database` binding satisfies it, and
 * so does a test double.
 */
export type D1Meta = { changes?: number; last_row_id?: number }

export type D1Result<T> = { results: T[]; meta?: D1Meta }

export type D1Statement = {
  bind(...values: unknown[]): D1Statement
  first<T>(): Promise<T | null>
  all<T>(): Promise<D1Result<T>>
  /**
   * `meta.changes` is how a conditional write reports whether it matched.
   * Without interactive transactions, that count is the signal a
   * compare-and-set succeeded.
   */
  run(): Promise<{ meta?: D1Meta }>
}

export type D1 = {
  prepare(query: string): D1Statement
  batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]>
}
