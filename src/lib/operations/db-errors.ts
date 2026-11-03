/** A table that is not migrated yet (42P01 / PGRST205). Pure — safe in client bundles. */
export function isMissingRelation(error: unknown): boolean {
  if (!error) return false
  const code = (error as { code?: string }).code
  const message = String((error as { message?: string }).message ?? '')
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|schema cache/i.test(message)
}

/**
 * The table or a column it needs is not in the expected migrated shape
 * (missing relation, 42703 undefined column, PGRST204 unknown column).
 * Production's `notifications` table is an older shape, so this — not a
 * bare table check — decides whether a feature is available.
 */
export function isSchemaNotReady(error: unknown): boolean {
  if (isMissingRelation(error)) return true
  return isMissingColumn(error)
}

/** Postgres 42703 / PGRST204 phrasing, including driver-wrapped messages. */
export function isMissingColumn(error: unknown): boolean {
  if (!error) return false
  const code = (error as { code?: string }).code
  if (code === '42703' || code === 'PGRST204') return true
  const message = String((error as { message?: string }).message ?? '')
  return /column\s+.*(does not exist|does not exist|is not known)/i.test(message)
    || /undefined column|unknown column/i.test(message)
}
