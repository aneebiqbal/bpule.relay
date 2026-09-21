'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import type { RevenueIdentityWithAssignment } from '@/lib/domain/types'

type ContactPoint = {
  id: string
  type: string
  value: string
  source: string
  verificationStatus: 'VERIFIED' | 'LIKELY_VALID' | 'UNVERIFIED' | 'INVALID' | 'BOUNCED' | 'UNKNOWN'
  isPrimary: boolean
  isBusinessContact: boolean
}

type PreparedDraft = {
  id: string
  draftStatus: 'DRAFT' | 'RESEARCH_REQUIRED' | 'CONTACT_NOT_FOUND' | 'SKIP' | 'READY' | 'SENT' | 'FAILED'
  contactPointId: string | null
  contactEmail: string | null
  revenueIdentityId: string
  subject: string | null
  subjectCandidates: string[]
  body: string | null
  strategy: {
    whyEmail: string
    emailGoal: string
    proofToUse: string[]
    attachmentRecommendation: {
      relevance: 'RELEVANT' | 'OPTIONAL' | 'IRRELEVANT'
      artifactName: string | null
      reason: string
    }
    thingsNotToClaim: string[]
  } | null
  researchBrief: {
    rightToContact: string
    fit: string
    intent: string
    confidence: string
    recentRelevantEvidence: string[]
  } | null
  claimSafety: {
    safe: boolean
    issues: Array<{ sentence: string; reason: string }>
  } | null
  blockedReason: string | null
  updatedAt: string
}

type EmailWorkspaceData = {
  contacts: ContactPoint[]
  drafts: PreparedDraft[]
}

function verificationTone(status: ContactPoint['verificationStatus']): string {
  if (status === 'VERIFIED') return 'text-status-success'
  if (status === 'LIKELY_VALID') return 'text-cobalt'
  if (status === 'INVALID' || status === 'BOUNCED') return 'text-status-danger'
  return 'text-status-warning'
}

interface EmailOutreachPanelProps {
  leadId: string
  assignedIdentities: RevenueIdentityWithAssignment[]
  defaultIdentityId: string | null
  onSent?: () => void
}

export function EmailOutreachPanel({
  leadId,
  assignedIdentities,
  defaultIdentityId,
  onSent,
}: EmailOutreachPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<EmailWorkspaceData>({ contacts: [], drafts: [] })
  const [selectedContactId, setSelectedContactId] = useState<string>('')
  const [selectedIdentityId, setSelectedIdentityId] = useState(defaultIdentityId ?? assignedIdentities[0]?.id ?? '')
  const [newEmail, setNewEmail] = useState('')
  const [finding, setFinding] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [discoverSuggestions, setDiscoverSuggestions] = useState<Array<{
    email: string
    source: string
    verificationStatus: 'VERIFIED' | 'LIKELY_VALID' | 'UNVERIFIED' | 'INVALID' | 'BOUNCED' | 'UNKNOWN'
    confidence: number
  }>>([])
  const [preparing, setPreparing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendMessage, setSendMessage] = useState<string | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/email`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load email panel.')

      const nextWorkspace: EmailWorkspaceData = {
        contacts: (data.contacts ?? []) as ContactPoint[],
        drafts: (data.drafts ?? []) as PreparedDraft[],
      }
      setWorkspace(nextWorkspace)

      const defaultContact = nextWorkspace.contacts.find((c) => c.type === 'email' && c.isPrimary)
        ?? nextWorkspace.contacts.find((c) => c.type === 'email')
      setSelectedContactId(defaultContact?.id ?? '')

      const ready = nextWorkspace.drafts.find((d) => d.draftStatus === 'READY')
        ?? nextWorkspace.drafts[0]
      setSubject(ready?.subject ?? '')
      setBody(ready?.body ?? '')

      if (ready?.revenueIdentityId) {
        setSelectedIdentityId(ready.revenueIdentityId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load email panel.')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  const emailContacts = useMemo(
    () => workspace.contacts.filter((c) => c.type === 'email'),
    [workspace.contacts],
  )

  const activeDraft = useMemo(
    () => workspace.drafts.find((d) => d.draftStatus === 'READY')
      ?? workspace.drafts.find((d) => d.draftStatus === 'RESEARCH_REQUIRED' || d.draftStatus === 'FAILED')
      ?? workspace.drafts[0]
      ?? null,
    [workspace.drafts],
  )

  async function addContactEmail(value: string, source: string) {
    const email = value.trim()
    if (!email) return
    setError(null)
    const res = await fetch(`/api/leads/${leadId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'email',
        value: email,
        source,
        isPrimary: emailContacts.length === 0,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Failed to save contact email.')
      return
    }
    setNewEmail('')
    await load()
  }

  async function discoverContacts() {
    setFinding(true)
    setDiscoverError(null)
    setDiscoverSuggestions([])
    try {
      const res = await fetch(`/api/leads/${leadId}/contacts/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to discover contacts.')
      setDiscoverSuggestions(data.suggestions ?? [])
    } catch (err) {
      setDiscoverError(err instanceof Error ? err.message : 'Failed to discover contacts.')
    } finally {
      setFinding(false)
    }
  }

  async function prepareEmail() {
    setPreparing(true)
    setError(null)
    setSendMessage(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/email/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revenueIdentityId: selectedIdentityId || null,
          contactPointId: selectedContactId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to prepare email.')

      await load()
      if (data.draft?.subject) setSubject(data.draft.subject)
      if (data.draft?.body) setBody(data.draft.body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare email.')
    } finally {
      setPreparing(false)
    }
  }

  async function sendEmail() {
    if (!activeDraft) return
    setSending(true)
    setError(null)
    setSendMessage(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draftId: activeDraft.id,
          idempotencyKey: `lead:${leadId}:draft:${activeDraft.id}`,
          subject,
          body,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send email.')
      setSendMessage(data.idempotent ? 'Send already recorded for this draft.' : 'Email sent from Relay.')
      await load()
      onSent?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-line bg-bone-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-ink">EMAIL</h2>
          <p className="text-xs text-graphite">Research, reason, sender, proof, email.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Refresh</Button>
      </div>

      {loading && <p className="text-sm text-graphite">Loading email workspace...</p>}
      {error && <p className="text-sm text-status-danger">{error}</p>}

      {!loading && (
        <>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-stone">CONTACT</p>

            {emailContacts.length === 0 ? (
              <p className="text-sm text-graphite">No business email found yet.</p>
            ) : (
              <div className="space-y-1">
                {emailContacts.map((contact) => (
                  <label key={contact.id} className="flex cursor-pointer items-center justify-between rounded-md border border-line px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="selected-contact"
                        checked={selectedContactId === contact.id}
                        onChange={() => setSelectedContactId(contact.id)}
                      />
                      <span className="text-sm text-ink">{contact.value}</span>
                      {contact.isPrimary && <span className="rounded bg-bone px-1.5 py-0.5 text-[10px] text-stone">Primary</span>}
                    </div>
                    <span className={`text-[11px] font-medium ${verificationTone(contact.verificationStatus)}`}>{contact.verificationStatus}</span>
                  </label>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Enter business email"
              />
              <Button size="sm" variant="outline" onClick={() => void addContactEmail(newEmail, 'USER_PROVIDED')}>
                Save
              </Button>
              <Button size="sm" onClick={() => void discoverContacts()} loading={finding}>
                {finding ? 'Finding...' : 'Find Contact'}
              </Button>
            </div>

            {discoverError && <p className="text-xs text-status-danger">{discoverError}</p>}
            {discoverSuggestions.length > 0 && (
              <div className="space-y-1 rounded-md border border-line bg-bone p-2">
                {discoverSuggestions.map((s) => (
                  <div key={`${s.email}:${s.source}`} className="flex items-center justify-between gap-2">
                    <p className="text-xs text-ink">
                      {s.email} <span className="text-stone">({s.source}, {Math.round(s.confidence * 100)}%)</span>
                    </p>
                    <Button size="sm" variant="outline" onClick={() => void addContactEmail(s.email, s.source)}>
                      Use
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-stone">SENDER</p>
            <Select value={selectedIdentityId} onChange={(e) => setSelectedIdentityId(e.target.value)}>
              {assignedIdentities.map((identity) => (
                <option key={identity.id} value={identity.id}>
                  {identity.identityName} - {identity.channel.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => void prepareEmail()} disabled={preparing || !selectedIdentityId} loading={preparing}>
              {preparing ? 'Preparing...' : 'Prepare Email'}
            </Button>
            <span className="text-xs text-graphite">No email is sent during preparation.</span>
          </div>

          {activeDraft && (
            <div className="space-y-3 rounded-md border border-line bg-bone p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-stone">EMAIL STRATEGY</p>
              <div className="space-y-1 text-sm">
                <p><span className="text-stone">Why email:</span> {activeDraft.strategy?.whyEmail ?? activeDraft.blockedReason ?? 'Not ready yet.'}</p>
                <p><span className="text-stone">Goal:</span> {activeDraft.strategy?.emailGoal ?? '-'}</p>
                <p><span className="text-stone">Proof:</span> {activeDraft.strategy?.proofToUse?.[0] ?? 'No proof yet'}</p>
                <p>
                  <span className="text-stone">Attachment:</span> {activeDraft.strategy?.attachmentRecommendation?.artifactName ?? 'No attachment'}
                  {activeDraft.strategy?.attachmentRecommendation?.reason ? ` - ${activeDraft.strategy.attachmentRecommendation.reason}` : ''}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-subject">SUBJECT</Label>
                <Input id="email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                {activeDraft.subjectCandidates.length > 1 && (
                  <div className="flex flex-wrap gap-1">
                    {activeDraft.subjectCandidates.map((candidate) => (
                      <button
                        key={candidate}
                        type="button"
                        onClick={() => setSubject(candidate)}
                        className="rounded border border-line px-2 py-1 text-[11px] text-graphite hover:text-ink"
                      >
                        {candidate}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email-body">BODY</Label>
                <Textarea
                  id="email-body"
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              {activeDraft.claimSafety && !activeDraft.claimSafety.safe && (
                <div className="rounded border border-status-danger/30 bg-status-danger/5 p-2">
                  <p className="text-xs font-medium text-status-danger">Claim safety issues</p>
                  {activeDraft.claimSafety.issues.map((issue, idx) => (
                    <p key={`${issue.reason}:${idx}`} className="text-xs text-status-danger">- {issue.reason}</p>
                  ))}
                </div>
              )}

              {activeDraft.blockedReason && (
                <p className="text-xs text-status-warning">{activeDraft.blockedReason}</p>
              )}

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => void sendEmail()}
                  disabled={sending || activeDraft.draftStatus !== 'READY' || !subject.trim() || !body.trim()}
                  loading={sending}
                >
                  {sending ? 'Sending...' : 'Send from Relay'}
                </Button>
                <span className="text-xs text-graphite">Human approval required for each first cold email.</span>
              </div>
            </div>
          )}

          {sendMessage && <p className="text-sm text-status-success">{sendMessage}</p>}
        </>
      )}
    </section>
  )
}
