export function formatBenchmarkTimestamp(timestamp: string): string {
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return 'Unavailable'

  return `${new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(value)} UTC`
}
