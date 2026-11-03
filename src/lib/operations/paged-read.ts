/**
 * Read every row of a bounded, deterministically ordered query in pages, up to
 * a stated ceiling. Replaces single capped reads (2,000 accounts leads, 5,000
 * performance events) that silently dropped rows past the cap: now the whole
 * scope is read, and `truncated` is true only past the ceiling — which the UI
 * states. The query builder must apply a total order (e.g. created_at + id).
 */
export interface PagedReadResult<T> {
  rows: T[]
  truncated: boolean
  pages: number
}

type PageQuery<T> = PromiseLike<{ data: T[] | null; error: unknown }>

export async function readAllPages<T>(
  page: (from: number, to: number) => PageQuery<T>,
  options: { pageSize?: number; ceiling: number },
): Promise<PagedReadResult<T>> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? 1000, options.ceiling))
  const rows: T[] = []
  let pages = 0
  while (rows.length < options.ceiling) {
    const from = rows.length
    const to = Math.min(from + pageSize, options.ceiling) - 1
    const { data, error } = await page(from, to)
    pages += 1
    if (error) throw error
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < to - from + 1) return { rows, truncated: false, pages }
  }
  // Exactly at the ceiling: probe one row to know whether anything was cut.
  const { data, error } = await page(options.ceiling, options.ceiling)
  if (error) throw error
  return { rows, truncated: (data ?? []).length > 0, pages: pages + 1 }
}
