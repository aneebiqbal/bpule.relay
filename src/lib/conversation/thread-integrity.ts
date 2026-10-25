/**
 * Thread integrity.
 *
 * An inbound message must belong to the lead it is attached to. The paste flow
 * trusts the URL lead id alone, so an unrelated reply can be attached to the
 * wrong thread. When the caller supplies any sender identity (profile URL,
 * email, provider thread id), it is checked against the lead's known contact;
 * a mismatch refuses to attach and asks for review.
 */

export interface ThreadIdentityInput {
  senderUrl?: string | null
  senderEmail?: string | null
  providerThreadId?: string | null
  leadUrl?: string | null
  knownContact?: string | null
  knownThreadId?: string | null
}

export type ThreadIdentityResult =
  | { ok: true }
  | { ok: false; code: 'THREAD_MISMATCH_REVIEW_REQUIRED'; reason: string }

const norm = (v?: string | null) => (v ?? '').trim().toLowerCase()

/** True when two profile URLs plausibly refer to the same person. */
function urlsMatch(a: string, b: string): boolean {
  const na = norm(a).replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const nb = norm(b).replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!na || !nb) return false
  return na === nb || na.includes(nb) || nb.includes(na)
}

export function validateThreadIdentity(input: ThreadIdentityInput): ThreadIdentityResult {
  const senderUrl = norm(input.senderUrl)
  const leadUrl = norm(input.leadUrl)
  if (senderUrl && leadUrl && !urlsMatch(senderUrl, leadUrl)) {
    return {
      ok: false,
      code: 'THREAD_MISMATCH_REVIEW_REQUIRED',
      reason: 'The supplied sender profile URL does not match this lead.',
    }
  }

  const senderEmail = norm(input.senderEmail)
  const knownContact = norm(input.knownContact)
  if (senderEmail && knownContact && senderEmail !== knownContact) {
    return {
      ok: false,
      code: 'THREAD_MISMATCH_REVIEW_REQUIRED',
      reason: 'The supplied sender email does not match this lead.',
    }
  }

  const threadId = norm(input.providerThreadId)
  const knownThreadId = norm(input.knownThreadId)
  if (threadId && knownThreadId && threadId !== knownThreadId) {
    return {
      ok: false,
      code: 'THREAD_MISMATCH_REVIEW_REQUIRED',
      reason: 'The provider thread id does not match this lead.',
    }
  }

  return { ok: true }
}
