import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Fact,
  Lead,
  Message,
  Outcome,
  Play,
  Profile,
  ProofItem,
  Rep,
  SignalId,
  Verdict,
  VoiceProfile,
} from '@/lib/domain/types'
import type {
  CreateLeadResult,
  DosageResult,
  NewLeadInput,
  QueueData,
  SaveDraftInput,
  ScoutStore,
  TeamStats,
  TodayDashboard,
} from '@/lib/store/types'
import { companyFuzzyKey, companyKey } from '@/lib/leads/normalize'
import { dailySendLimit, messageTypeLimit } from '@/lib/ai/config'
import { computeRates, type RateBucket } from '@/lib/store/rates'
import { matchProofItemsByTags } from '@/lib/ai/proof-match'
import { pickPlayForSignal } from '@/lib/score/plays'

type Row = Record<string, unknown>

function mapLead(r: Row): Lead {
  return {
    id: r.id as string,
    ownerRepId: (r.owner_rep_id as string) ?? null,
    company: r.company as string,
    companyKey: r.company_key as string,
    contactName: (r.contact_name as string) ?? null,
    contactTitle: (r.contact_title as string) ?? null,
    url: (r.url as string) ?? null,
    rawInput: (r.raw_input as string) ?? null,
    signalType: (r.signal_type as Lead['signalType']) ?? null,
    signalEvidence: (r.signal_evidence as string) ?? null,
    verbatimQuote: (r.verbatim_quote as string) ?? null,
    score: (r.score as number) ?? null,
    verdict: (r.verdict as Lead['verdict']) ?? null,
    status: (r.status as Lead['status']) ?? 'new',
    playId: (r.play_id as string) ?? null,
    tags: (r.tags as string[]) ?? [],
    createdAt: r.created_at as string,
  }
}

function mapMessage(r: Row): Message {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    repId: (r.rep_id as string) ?? null,
    type: r.type as Message['type'],
    draftText: (r.draft_text as string) ?? null,
    sentText: (r.sent_text as string) ?? null,
    sentAt: (r.sent_at as string) ?? null,
    modelUsed: (r.model_used as string) ?? null,
    createdAt: r.created_at as string,
  }
}

function mapOutcome(r: Row): Outcome {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    stage: r.stage as Outcome['stage'],
    occurredAt: r.occurred_at as string,
  }
}

function mapFact(r: Row): Fact {
  return {
    id: r.id as string,
    label: r.label as string,
    value: r.value as string,
    factType: (r.fact_type as string) ?? null,
    addedBy: (r.added_by as string) ?? null,
    createdAt: r.created_at as string,
  }
}

function mapPlay(r: Row): Play {
  return {
    id: r.id as string,
    name: r.name as string,
    situation: r.situation as string,
    templateShape: r.template_shape as string,
  }
}

function mapProfile(r: Row): Profile {
  return {
    id: r.id as string,
    repId: r.rep_id as string,
    platform: r.platform as Profile['platform'],
    label: (r.label as string) ?? null,
    profileUrl: (r.profile_url as string) ?? null,
    headline: (r.headline as string) ?? null,
    cvPath: (r.cv_path as string) ?? null,
    createdAt: r.created_at as string,
  }
}

/**
 * Query-layer enforcement of the proof rule: a client name is only ever
 * exposed when permission is on file. Without permission the field is null
 * here, before any prompt or UI ever sees it.
 */
function mapProofItem(r: Row): ProofItem {
  const permissionOnFile = Boolean(r.permission_on_file)
  return {
    id: r.id as string,
    profileId: r.profile_id as string,
    clientNamed: Boolean(r.client_named),
    clientName: permissionOnFile ? ((r.client_name as string) ?? null) : null,
    permissionOnFile,
    projectSummary: r.project_summary as string,
    reviewQuote: (r.review_quote as string) ?? null,
    tags: (r.tags as string[]) ?? [],
    createdAt: r.created_at as string,
  }
}

/**
 * Supabase store. RLS is enforced by the per-request client that carries the
 * signed-in session, so a rep literally cannot read or mutate another rep's
 * queue from this code path.
 */
export class SupabaseStore implements ScoutStore {
  constructor(
    private readonly rep: Rep,
    private readonly client: SupabaseClient,
  ) {}

  private async fetchLeadsAll(): Promise<Lead[]> {
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapLead)
  }

  private async fetchRates(): Promise<RateBucket[]> {
    const [leads, messages, outcomes] = await Promise.all([
      this.fetchLeadsAll(),
      this.client
        .from('messages')
        .select('*')
        .then((r) => {
          if (r.error) throw r.error
          return (r.data ?? []).map(mapMessage)
        }),
      this.client
        .from('outcomes')
        .select('*')
        .then((r) => {
          if (r.error) throw r.error
          return (r.data ?? []).map(mapOutcome)
        }),
    ])
    return leads.map((lead) => ({
      lead,
      sentMessages: messages.filter((m) => m.leadId === lead.id),
      outcomes: outcomes.filter((o) => o.leadId === lead.id),
    }))
  }

  private async countTodaysSends(type?: string): Promise<number> {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 86_400_000)
    let q = this.client
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('rep_id', this.rep.id)
      .gte('sent_at', start.toISOString())
      .lt('sent_at', end.toISOString())
    if (type) q = q.eq('type', type)
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  }

  async createLead(input: NewLeadInput): Promise<CreateLeadResult> {
    const key = companyKey(input.company)
    const fuzzy = companyFuzzyKey(input.company)
    const all = await this.fetchLeadsAll()

    const priorNo = all.find(
      (l) => l.companyKey === key && (l.status === 'no' || l.status === 'dead'),
    )
    if (priorNo) {
      return {
        blocked: true,
        reason: 'This company was already flagged no by the team. It is locked for everyone.',
        existingOwnerName: await this.repName(priorNo.ownerRepId),
      }
    }

    const exact = all.find((l) => l.companyKey === key && l.status !== 'dead')
    const fuzzyHit = all.find(
      (l) => l.companyKey !== key && companyFuzzyKey(l.company) === fuzzy && l.status !== 'dead',
    )
    const hit = exact ?? fuzzyHit
    if (hit) {
      return {
        blocked: true,
        reason: 'This company already exists on the board.',
        existingOwnerName: await this.repName(hit.ownerRepId),
      }
    }

    const { data, error } = await this.client
      .from('leads')
      .insert({
        owner_rep_id: this.rep.id,
        company: input.company.trim(),
        contact_name: input.contactName?.trim() || null,
        contact_title: input.contactTitle?.trim() || null,
        url: input.url?.trim() || null,
        raw_input: input.rawInput?.trim() || null,
        signal_type: input.signalType,
        signal_evidence: input.signalEvidence.trim(),
        verbatim_quote: input.verbatimQuote?.trim() || null,
        tags: input.tags ?? [],
        play_id: (await this.playForSignal(input.signalType))?.id ?? null,
      })
      .select('*')
      .single()
    if (error) throw error
    return { blocked: false, lead: mapLead(data as Row) }
  }

  private async playForSignal(signalType: SignalId): Promise<Play | null> {
    return pickPlayForSignal(await this.listPlays(), signalType)
  }

  private async repName(repId: string | null): Promise<string | undefined> {
    if (!repId) return undefined
    const { data } = await this.client
      .from('reps')
      .select('name')
      .eq('id', repId)
      .maybeSingle()
    return data?.name ?? undefined
  }

  async updateLeadScore(
    id: string,
    score: { total: number; verdict: Verdict },
  ): Promise<void> {
    const { error } = await this.client
      .from('leads')
      .update({ score: score.total, verdict: score.verdict })
      .eq('id', id)
      .eq('owner_rep_id', this.rep.id)
    if (error) throw error
  }

  async updateLeadTags(id: string, tags: string[]): Promise<void> {
    const { error } = await this.client
      .from('leads')
      .update({ tags })
      .eq('id', id)
      .eq('owner_rep_id', this.rep.id)
    if (error) throw error
  }

  async getLead(id: string) {
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) return null

    const [messages, outcomes] = await Promise.all([
      this.client
        .from('messages')
        .select('*')
        .eq('lead_id', id)
        .order('created_at', { ascending: false })
        .then((r) => {
          if (r.error) throw r.error
          return (r.data ?? []).map(mapMessage)
        }),
      this.client
        .from('outcomes')
        .select('*')
        .eq('lead_id', id)
        .then((r) => {
          if (r.error) throw r.error
          return (r.data ?? []).map(mapOutcome)
        }),
    ])

    return { ...mapLead(data as Row), messages, outcomes }
  }

  async listOwnedLeads(): Promise<Lead[]> {
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .eq('owner_rep_id', this.rep.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapLead)
  }

  async getQueue(): Promise<QueueData> {
    const owned = await this.listOwnedLeads()
    const queue = owned.filter((l) => l.status === 'new' || l.status === 'contacted')
    const replies = owned.filter((l) => l.status === 'replied')
    const todaySends = await this.countTodaysSends()
    return { todaySends, dailyLimit: dailySendLimit(), queue, replies }
  }

  async saveDraft(input: SaveDraftInput): Promise<Message> {
    const { data, error } = await this.client
      .from('messages')
      .insert({
        lead_id: input.leadId,
        rep_id: this.rep.id,
        type: input.type,
        draft_text: input.draftText,
        model_used: input.modelUsed,
      })
      .select('*')
      .single()
    if (error) throw error
    return mapMessage(data as Row)
  }

  async markContacted(
    leadId: string,
    sentText: string,
    messageType: Message['type'] = 'dm',
  ): Promise<DosageResult> {
    const type = messageType
    const todaySends = await this.countTodaysSends(type)
    const limit = messageTypeLimit(type)
    if (todaySends >= limit) {
      return {
        allowed: false,
        todaySends,
        limit,
        message: `Daily ceiling of ${limit} reached for ${type} messages. ${type === 'dm' || type === 'followup' ? 'Other message types still have budget.' : 'Other message types still have budget.'}`,
      }
    }

    const [{ error: updateError }, { error: insertError }] = await Promise.all([
      this.client
        .from('leads')
        .update({ status: type === 'followup' ? 'followed_up' : 'contacted' })
        .eq('id', leadId)
        .eq('owner_rep_id', this.rep.id),
      this.client.from('messages').insert({
        lead_id: leadId,
        rep_id: this.rep.id,
        type,
        sent_text: sentText,
        sent_at: new Date().toISOString(),
      }),
    ])
    if (updateError) throw updateError
    if (insertError) throw insertError
    return { allowed: true, todaySends: todaySends + 1, limit }
  }

  async getVoiceProfile(): Promise<VoiceProfile | null> {
    const { data, error } = await this.client
      .from('voice_profiles')
      .select('*')
      .eq('rep_id', this.rep.id)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const r = data as Row
    return {
      id: r.id as string,
      repId: r.rep_id as string,
      styleCard: r.style_card as VoiceProfile['styleCard'],
      sampleSource: r.sample_source as VoiceProfile['sampleSource'],
      calibratedAt: r.calibrated_at as string,
    }
  }

  async setVoiceProfile(
    styleCard: VoiceProfile['styleCard'],
    sampleSource: VoiceProfile['sampleSource'],
  ): Promise<VoiceProfile> {
    const { data, error } = await this.client
      .from('voice_profiles')
      .upsert(
        {
          rep_id: this.rep.id,
          style_card: JSON.parse(JSON.stringify(styleCard)),
          sample_source: sampleSource,
          calibrated_at: new Date().toISOString(),
        },
        { onConflict: 'rep_id' },
      )
      .select('*')
      .single()
    if (error) throw error
    const r = data as Row
    return {
      id: r.id as string,
      repId: r.rep_id as string,
      styleCard: r.style_card as VoiceProfile['styleCard'],
      sampleSource: r.sample_source as VoiceProfile['sampleSource'],
      calibratedAt: r.calibrated_at as string,
    }
  }

  async listFacts(): Promise<Fact[]> {
    const { data, error } = await this.client
      .from('facts')
      .select('*')
      .order('label', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapFact)
  }

  async upsertFact(input: {
    id?: string
    label: string
    value: string
    factType?: string | null
  }): Promise<Fact> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const row = input.id
      ? await this.client
          .from('facts')
          .update({
            label: input.label,
            value: input.value,
            fact_type: input.factType ?? null,
          })
          .eq('id', input.id)
          .select('*')
          .single()
      : await this.client
          .from('facts')
          .insert({
            label: input.label,
            value: input.value,
            fact_type: input.factType ?? null,
            added_by: this.rep.id,
          })
          .select('*')
          .single()
    if (row.error) throw row.error
    return mapFact(row.data as Row)
  }

  async deleteFact(id: string): Promise<void> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const { error } = await this.client.from('facts').delete().eq('id', id)
    if (error) throw error
  }

  async listPlays(): Promise<Play[]> {
    const { data, error } = await this.client.from('plays').select('*')
    if (error) throw error
    return (data ?? []).map(mapPlay)
  }

  async listProfiles(): Promise<Profile[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('rep_id', this.rep.id)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapProfile)
  }

  async getProfile(id: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data || (data as Row).rep_id !== this.rep.id) return null
    return mapProfile(data as Row)
  }

  async upsertProfile(input: {
    id?: string
    platform: 'linkedin' | 'upwork'
    label?: string | null
    profileUrl?: string | null
    headline?: string | null
    cvPath?: string | null
  }): Promise<Profile> {
    const row = input.id
      ? await this.client
          .from('profiles')
          .update({
            platform: input.platform,
            label: input.label ?? null,
            profile_url: input.profileUrl ?? null,
            headline: input.headline ?? null,
            cv_path: input.cvPath ?? null,
          })
          .eq('id', input.id)
          .eq('rep_id', this.rep.id)
          .select('*')
          .single()
      : await this.client
          .from('profiles')
          .insert({
            rep_id: this.rep.id,
            platform: input.platform,
            label: input.label ?? null,
            profile_url: input.profileUrl ?? null,
            headline: input.headline ?? null,
            cv_path: input.cvPath ?? null,
          })
          .select('*')
          .single()
    if (row.error) throw row.error
    return mapProfile(row.data as Row)
  }

  async deleteProfile(id: string): Promise<void> {
    const profile = await this.getProfile(id)
    if (profile?.cvPath) {
      await this.client.storage.from('proof-cvs').remove([profile.cvPath])
    }
    const { error } = await this.client
      .from('profiles')
      .delete()
      .eq('id', id)
      .eq('rep_id', this.rep.id)
    if (error) throw error
  }

  async listProofItems(profileId: string): Promise<ProofItem[]> {
    const { data, error } = await this.client
      .from('proof_items')
      .select('*')
      .eq('profile_id', profileId)
    if (error) throw error
    return (data ?? []).map(mapProofItem)
  }

  async upsertProofItem(input: {
    id?: string
    profileId: string
    clientNamed?: boolean
    clientName?: string | null
    permissionOnFile?: boolean
    projectSummary: string
    reviewQuote?: string | null
    tags?: string[]
  }): Promise<ProofItem> {
    const permission = Boolean(input.permissionOnFile)
    // The client name is only stored if permission is on file.
    const clientName = permission ? (input.clientName ?? null) : null
    const row = input.id
      ? await this.client
          .from('proof_items')
          .update({
            client_named: Boolean(input.clientNamed),
            permission_on_file: permission,
            client_name: clientName,
            project_summary: input.projectSummary,
            review_quote: input.reviewQuote ?? null,
            tags: input.tags ?? [],
          })
          .eq('id', input.id)
          .eq('profile_id', input.profileId)
          .select('*')
          .single()
      : await this.client
          .from('proof_items')
          .insert({
            profile_id: input.profileId,
            client_named: Boolean(input.clientNamed),
            permission_on_file: permission,
            client_name: clientName,
            project_summary: input.projectSummary,
            review_quote: input.reviewQuote ?? null,
            tags: input.tags ?? [],
          })
          .select('*')
          .single()
    if (row.error) throw row.error
    return mapProofItem(row.data as Row)
  }

  async deleteProofItem(id: string): Promise<void> {
    const { error } = await this.client
      .from('proof_items')
      .delete()
      .eq('id', id)
    if (error) throw error
  }

  async matchProofItems(tags: string[], limit = 2): Promise<ProofItem[]> {
    const profiles = await this.listProfiles()
    const items = (
      await Promise.all(profiles.map((p) => this.listProofItems(p.id)))
    ).flat()
    return matchProofItemsByTags(items, tags, limit)
  }

  async getTodayDashboard(): Promise<TodayDashboard> {
    const [mine, buckets] = await Promise.all([this.getQueue(), this.fetchRates()])
    const team = computeRates(buckets)
    return { mine, team }
  }

  async getTeamStats(): Promise<TeamStats> {
    const [buckets, reps] = await Promise.all([
      this.fetchRates(),
      this.client
        .from('reps')
        .select('id, name, role, created_at')
        .then((r) => {
          if (r.error) throw r.error
          return (r.data ?? []).map((row: Row) => ({
            id: row.id as string,
            name: row.name as string,
            role: row.role as Rep['role'],
            createdAt: row.created_at as string,
          }))
        }),
    ])

    const overall = computeRates(buckets)
    const perRep = reps
      .filter((r) => r.role !== 'sourcer')
      .map((rep) => ({
        rep,
        ...computeRates(
          buckets.filter((b) => b.lead.ownerRepId === rep.id),
        ),
      }))
      .filter((row) => row.sent > 0 || row.replyRate !== null)

    const plays = await this.listPlays()
    const playGroups = new Map<string, RateBucket[]>()
    for (const b of buckets) {
      const key = b.lead.playId ?? ''
      if (!playGroups.has(key)) playGroups.set(key, [])
      playGroups.get(key)!.push(b)
    }
    const perPlay = [...playGroups.entries()]
      .map(([key, group]) => ({
        play: key ? (plays.find((p) => p.id === key) ?? null) : null,
        ...computeRates(group),
      }))
      .filter((row) => row.sent > 0 || row.replyRate !== null)
      .sort((a, b) => {
        const an = a.play?.name ?? 'No play'
        const bn = b.play?.name ?? 'No play'
        return an.localeCompare(bn)
      })

    return { overall, perRep, perPlay }
  }

  async listAllLeadsAdmin(): Promise<Lead[]> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    return this.fetchLeadsAll()
  }
}