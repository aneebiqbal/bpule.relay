export interface LiveRepActivity {
  id: string
  name: string
  connections: number
  dms: number
  followups: number
  emails: number
  replies: number
  total: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function displayRepName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? ''
  if (!trimmed || UUID.test(trimmed)) return null
  return trimmed
}

function emptyCounts() {
  return { connections: 0, dms: 0, followups: 0, emails: 0, replies: 0 }
}

function addMessage(bucket: ReturnType<typeof emptyCounts>, type: string | null) {
  if (type === 'connection') bucket.connections += 1
  else if (type === 'dm') bucket.dms += 1
  else if (type === 'followup') bucket.followups += 1
  else if (type === 'email') bucket.emails += 1
  else if (type === 'reply') bucket.replies += 1
}

/**
 * Every teammate, named, including people who have not sent yet.
 * Message rows may point at a rep id or an auth user id. Raw ids are never used as labels.
 */
export function assembleWhoSentWhat(input: {
  reps: Array<{ id: string; name: string | null; authUserId?: string | null }>
  messages: Array<{ repId: string | null; type: string | null; direction?: string | null }>
}): LiveRepActivity[] {
  const alias = new Map<string, string>()
  const buckets = new Map<string, { name: string; counts: ReturnType<typeof emptyCounts> }>()

  for (const rep of input.reps) {
    const name = displayRepName(rep.name)
    if (!name) continue
    alias.set(rep.id, rep.id)
    if (rep.authUserId) alias.set(rep.authUserId, rep.id)
    if (!buckets.has(rep.id)) buckets.set(rep.id, { name, counts: emptyCounts() })
  }

  for (const message of input.messages) {
    if (!message.repId || message.direction === 'inbound') continue
    const repId = alias.get(message.repId)
    if (!repId) continue
    const bucket = buckets.get(repId)
    if (!bucket) continue
    addMessage(bucket.counts, message.type)
  }

  return Array.from(buckets.entries())
    .map(([id, bucket]) => {
      const total = bucket.counts.connections + bucket.counts.dms + bucket.counts.followups + bucket.counts.emails + bucket.counts.replies
      return { id, name: bucket.name, ...bucket.counts, total }
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}
