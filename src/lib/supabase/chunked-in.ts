/**
 * PostgREST puts the whole `in.(...)` list in the query string. A few hundred
 * UUIDs exceed the proxy's URL limit and the request comes back with no rows
 * (not always with an error), which silently renders an organisation as empty:
 * no messages, no activity, an all-zero heatmap.
 *
 * Run the query once per chunk and concatenate. The caller keeps ownership of
 * ordering and de-duplication.
 */
const DEFAULT_CHUNK_SIZE = 100

export interface ChunkedResult {
  data: unknown
  error: unknown
}

export async function chunkedIn<T>(
  ids: readonly string[],
  run: (chunk: string[]) => PromiseLike<ChunkedResult>,
  chunkSize = DEFAULT_CHUNK_SIZE,
): Promise<T[]> {
  if (ids.length === 0) return []
  const out: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await run(ids.slice(i, i + chunkSize))
    if (error) throw error
    if (data) out.push(...(data as T[]))
  }
  return out
}
