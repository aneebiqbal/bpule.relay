import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  CsvImport,
  Fact,
  Lead,
  Message,
  NotificationLogEntry,
  Outcome,
  Play,
  Profile,
  ProofItem,
  PushSubscription,
  Rep,
  SignalId,
  UpworkJob,
  UpworkMessage,
  Verdict,
  VoiceProfile,
} from '@/lib/domain/types'
import type {
  CreateLeadResult,
  DosageResult,
  ExtractionMetrics,
  FollowupDue,
  ModelCallLogInput,
  MyRank,
  NewLeadInput,
  QueueData,
  SaveDraftInput,
  ScoutStore,
  SendBudget,
  TeamStats,
  TodayDashboard,
  UpworkSnapshot,
} from '@/lib/store/types'
import { companyFuzzyKey, companyKey } from '@/lib/leads/normalize'
import { dailyConnectionSendLimit, dailySendLimit, messageTypeLimit } from '@/lib/ai/config'
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
    titleRaw: (r.title_raw as string) ?? null,
    locationRaw: (r.location_raw as string) ?? null,
    url: (r.url as string) ?? null,
    rawInput: (r.raw_input as string) ?? null,
    roleCategory: (r.role_category as Lead['roleCategory']) ?? null,
    marketRegion: (r.market_region as Lead['marketRegion']) ?? null,
    extractionConfidence: (r.extraction_confidence as number) ?? null,
    extractionProfile: (r.extraction_profile as Record<string, unknown>) ?? null,
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
 * Admin-only mapping: the real client_name is exposed regardless of
 * permission_on_file, so the admin can see who the client actually is when
 * deciding whether to flip that flag. Never used on a path a non-admin can
 * reach.
 */
function mapProofItemUnredacted(r: Row): ProofItem {
  return {
    id: r.id as string,
    profileId: r.profile_id as string,
    clientNamed: Boolean(r.client_named),
    clientName: (r.client_name as string) ?? null,
    permissionOnFile: Boolean(r.permission_on_file),
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

  private todayRange(): { start: string; end: string } {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start.getTime() + 86_400_000)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  /** Counts lead messages of any of the given types sent today — dm+followup and connection are two different ceilings (Part 7 rule) and must never be blended into one number. */
  private async countTodaysSendsByTypes(types: string[]): Promise<number> {
    const { start, end } = this.todayRange()
    const { count, error } = await this.client
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('rep_id', this.rep.id)
      .in('type', types)
      .gte('sent_at', start)
      .lt('sent_at', end)
    if (error) throw error
    return count ?? 0
  }

  /** Upwork applies today share the connection-type daily ceiling but live in a separate table; countTodaysSendsByTypes alone would silently miss them. */
  private async countTodaysUpworkApplies(): Promise<number> {
    const { start, end } = this.todayRange()
    const { count, error } = await this.client
      .from('upwork_messages')
      .select('id', { count: 'exact', head: true })
      .eq('rep_id', this.rep.id)
      .not('sent_at', 'is', null)
      .gte('sent_at', start)
      .lt('sent_at', end)
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

    const insertRow = {
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
      title_raw: input.titleRaw?.trim() || null,
      location_raw: input.locationRaw?.trim() || null,
      role_category: input.roleCategory ?? null,
      market_region: input.marketRegion ?? null,
      extraction_confidence: input.extractionConfidence ?? null,
      extraction_profile: input.extractionProfile ?? null,
    }

    const row = await this.client.from('leads').insert(insertRow).select('*').single()
    if (row.error) {
      // Never silently drop the extraction fields (title/location/role/region/
      // confidence): a lead saved without them looks fine but is missing the
      // data a rep would need to trust it later. Fail loudly instead so
      // whoever operates this environment applies migration 0015, rather than
      // BD discovering thin leads after the fact.
      if ((row.error as { code?: string }).code === '42703') {
        throw new Error(
          'This environment is missing the extraction-fields migration (0015_extraction_schema_and_metrics.sql). ' +
            'Apply it before saving leads, so title, location, role, region, and confidence are never silently dropped.',
        )
      }
      throw row.error
    }
    return { blocked: false, lead: mapLead(row.data as Row) }
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

    const [{ data: updatedRows, error: updateError }, { error: insertError }] = await Promise.all([
      this.client
        .from('leads')
        .update({ status: type === 'followup' ? 'followed_up' : 'contacted' })
        .eq('id', leadId)
        .eq('owner_rep_id', this.rep.id)
        .select('id'),
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
    // A 0-row update means this lead is now visible (team-wide select) but not
    // owned by this rep — Postgres does not error on a matched-0-rows update,
    // so without this check the caller would wrongly be told the send worked.
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error('You are not the owner of this lead, so it could not be marked contacted.')
    }
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

  async listAllReps(): Promise<Rep[]> {
    const { data, error } = await this.client
      .from('reps')
      .select('id, name, role, created_at')
      .order('name', { ascending: true })
    if (error) throw error
    return (data ?? []).map((row: Row) => ({
      id: row.id as string,
      name: row.name as string,
      role: row.role as Rep['role'],
      createdAt: row.created_at as string,
    }))
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

  async listAllProfiles(): Promise<Profile[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map(mapProfile)
  }

  async upsertProfileAdmin(input: {
    id?: string
    repId: string
    platform: 'linkedin' | 'upwork'
    label?: string | null
    profileUrl?: string | null
    headline?: string | null
    cvPath?: string | null
  }): Promise<Profile> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
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
          .select('*')
          .single()
      : await this.client
          .from('profiles')
          .insert({
            rep_id: input.repId,
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

  async deleteProfileAdmin(id: string): Promise<void> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const { data } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    const cvPath = (data as Row | null)?.cv_path as string | undefined
    if (cvPath) {
      await this.client.storage.from('proof-cvs').remove([cvPath])
    }
    const { error } = await this.client.from('profiles').delete().eq('id', id)
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

  async listProofItemsAdmin(profileId: string): Promise<ProofItem[]> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const { data, error } = await this.client
      .from('proof_items')
      .select('*')
      .eq('profile_id', profileId)
    if (error) throw error
    return (data ?? []).map(mapProofItemUnredacted)
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
    embedding?: number[] | null
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
            embedding: input.embedding ?? null,
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
            embedding: input.embedding ?? null,
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

  async upsertProofItemAdmin(input: {
    id?: string
    profileId: string
    clientNamed?: boolean
    clientName?: string | null
    permissionOnFile?: boolean
    projectSummary: string
    reviewQuote?: string | null
    tags?: string[]
    embedding?: number[] | null
  }): Promise<ProofItem> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const permission = Boolean(input.permissionOnFile)
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
            embedding: input.embedding ?? null,
          })
          .eq('id', input.id)
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
            embedding: input.embedding ?? null,
          })
          .select('*')
          .single()
    if (row.error) throw row.error
    return mapProofItemUnredacted(row.data as Row)
  }

  async deleteProofItemAdmin(id: string): Promise<void> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const { error } = await this.client.from('proof_items').delete().eq('id', id)
    if (error) throw error
  }

  async matchProofItems(tags: string[], limit = 2): Promise<ProofItem[]> {
    const profiles = await this.listAllProfiles()
    const items = (
      await Promise.all(profiles.map((p) => this.listProofItems(p.id)))
    ).flat()
    return matchProofItemsByTags(items, tags, limit)
  }

  /** Contacted leads 3+ days past their last send with no reply — same threshold the followup_eligible DB trigger uses (migration 0009), computed here so the homepage can show the whole bucket at once. */
  private async fetchFollowupsDue(): Promise<FollowupDue[]> {
    const owned = await this.listOwnedLeads()
    const contacted = owned.filter((l) => l.status === 'contacted')
    if (contacted.length === 0) return []

    const leadIds = contacted.map((l) => l.id)
    const [{ data: msgRows, error: msgErr }, { data: outcomeRows, error: outcomeErr }] = await Promise.all([
      this.client
        .from('messages')
        .select('lead_id, sent_at')
        .in('lead_id', leadIds)
        .not('sent_at', 'is', null),
      this.client.from('outcomes').select('lead_id').in('lead_id', leadIds).eq('stage', 'replied'),
    ])
    if (msgErr) throw msgErr
    if (outcomeErr) throw outcomeErr

    const repliedLeadIds = new Set((outcomeRows ?? []).map((r) => r.lead_id as string))
    const lastSentByLead = new Map<string, string>()
    for (const row of (msgRows ?? []) as Array<{ lead_id: string; sent_at: string }>) {
      const existing = lastSentByLead.get(row.lead_id)
      if (!existing || row.sent_at > existing) lastSentByLead.set(row.lead_id, row.sent_at)
    }

    const now = Date.now()
    const due: FollowupDue[] = []
    for (const lead of contacted) {
      if (repliedLeadIds.has(lead.id)) continue
      const lastSent = lastSentByLead.get(lead.id)
      if (!lastSent) continue
      const daysSinceContact = Math.floor((now - new Date(lastSent).getTime()) / 86_400_000)
      if (daysSinceContact >= 3) due.push({ lead, daysSinceContact })
    }
    return due.sort((a, b) => b.daysSinceContact - a.daysSinceContact)
  }

  private async fetchMyRank(): Promise<MyRank> {
    const stats = await this.getTeamStats()
    const mineRow = stats.perRep.find((r) => r.rep.id === this.rep.id)
    const withSends = stats.perRep.filter((r) => r.sent > 0 && r.replyRate !== null)
    const ranked = [...withSends].sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0))
    const position = mineRow && mineRow.sent > 0 ? ranked.findIndex((r) => r.rep.id === this.rep.id) + 1 : null
    return {
      mine: mineRow ?? null,
      teamAverage: stats.overall,
      position: position && position > 0 ? position : null,
      ofTotal: ranked.length,
    }
  }

  private async fetchUpworkSnapshot(): Promise<UpworkSnapshot> {
    const [jobs, todayApplies] = await Promise.all([
      this.listUpworkJobs(),
      this.countTodaysUpworkApplies(),
    ])
    const queue = jobs
      .filter((j) => j.status === 'new' || j.status === 'drafted')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    return { queue, todayApplies }
  }

  async getTodayDashboard(): Promise<TodayDashboard> {
    const [mine, buckets, dmFollowupSent, connectionSent, upworkApplies, notifications, followupsDue, myRank, upwork] =
      await Promise.all([
        this.getQueue(),
        this.fetchRates(),
        this.countTodaysSendsByTypes(['dm', 'followup']),
        this.countTodaysSendsByTypes(['connection']),
        this.countTodaysUpworkApplies(),
        this.listNotifications(),
        this.fetchFollowupsDue(),
        this.fetchMyRank(),
        this.fetchUpworkSnapshot(),
      ])
    const team = computeRates(buckets)
    const sendBudgets: SendBudget[] = [
      {
        label: 'DM & follow-up',
        types: ['dm', 'followup'],
        used: dmFollowupSent,
        limit: dailySendLimit(),
      },
      {
        label: 'Connection & Upwork',
        types: ['connection', 'upwork'],
        used: connectionSent + upworkApplies,
        limit: dailyConnectionSendLimit(),
      },
    ]
    return { mine, team, sendBudgets, notifications, followupsDue, myRank, upwork }
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

  async logExtractionRun(input: ModelCallLogInput): Promise<void> {
    const { error } = await this.client.from('extraction_runs').insert({
      rep_id: this.rep.id,
      task: input.task,
      success: input.success,
      latency_ms: Math.max(0, Math.round(input.latencyMs)),
      model: input.model,
      cost_tier: input.costTier ?? null,
      host: input.host ?? null,
      cost_usd: input.costUsd ?? null,
      error_message: input.error ?? null,
    })
    if (error) throw error
  }

  async getExtractionMetrics(): Promise<ExtractionMetrics> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await this.client
      .from('extraction_runs')
      .select('success, latency_ms, created_at, cost_tier, cost_usd')
      .gte('created_at', since)

    const emptyCostByTier = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 }
    const emptyRequestsByTier = { tier1: 0, tier2: 0, tier3: 0, tier4: 0 }
    if (error) {
      if ((error as { code?: string }).code === '42P01') {
        return {
          total: 0,
          failures: 0,
          failureRate: 0,
          avgLatencyMs: 0,
          p95LatencyMs: 0,
          costByTier: emptyCostByTier,
          totalCostUsd: 0,
          requestsByTier: emptyRequestsByTier,
        }
      }
      throw error
    }
    const rows = (data ?? []) as Array<{
      success: boolean
      latency_ms: number | null
      cost_tier: string | null
      cost_usd: number | null
    }>
    const total = rows.length
    const failures = rows.filter((r) => !r.success).length
    const failureRate = total > 0 ? failures / total : 0
    const latencies = rows
      .map((r) => Number(r.latency_ms ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)
    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length)
        : 0
    const p95LatencyMs =
      latencies.length > 0
        ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
        : 0
    const costByTier = { ...emptyCostByTier }
    const requestsByTier = { ...emptyRequestsByTier }
    for (const r of rows) {
      if (r.cost_tier && r.cost_tier in costByTier) {
        costByTier[r.cost_tier as keyof typeof costByTier] += Number(r.cost_usd ?? 0)
        requestsByTier[r.cost_tier as keyof typeof requestsByTier] += 1
      }
    }
    const totalCostUsd = Object.values(costByTier).reduce((sum, n) => sum + n, 0)
    return {
      total,
      failures,
      failureRate,
      costByTier,
      totalCostUsd,
      requestsByTier,
      avgLatencyMs,
      p95LatencyMs,
    }
  }

  async listAllLeadsAdmin(): Promise<Lead[]> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    return this.fetchLeadsAll()
  }

  // ==========================================================================
  // Semantic proof matching via pgvector
  // ==========================================================================

  async matchProofItemsByEmbedding(
    embedding: number[],
    limit = 2,
  ): Promise<Array<{ item: ProofItem; similarity: number }>> {
    const { data, error } = await this.client.rpc('match_proofs_by_embedding', {
      query_embedding: embedding,
      match_threshold: 0.72,
      match_count: limit,
    })
    if (error) throw error
    return (data ?? []).map((r: Row) => ({
      item: mapProofItem(r),
      similarity: (r.similarity as number) ?? 0,
    }))
  }

  // ==========================================================================
  // Eval harness
  // ==========================================================================

  async listGoldenSet(): Promise<import('@/lib/store/types').GoldenCaseRow[]> {
    const { data, error } = await this.client
      .from('golden_set')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map((r: Row) => ({
      id: r.id as string,
      leadId: r.lead_id as string,
      knownReplied: Boolean(r.known_replied),
      sentText: (r.sent_text as string) ?? '',
      note: (r.note as string) ?? null,
      active: Boolean(r.active),
      createdAt: r.created_at as string,
    }))
  }

  async addGoldenCase(input: {
    leadId: string
    messageId?: string
    knownReplied: boolean
    sentText?: string
    note?: string
  }): Promise<import('@/lib/store/types').GoldenCaseRow> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const { data, error } = await this.client
      .from('golden_set')
      .insert({
        lead_id: input.leadId,
        message_id: input.messageId ?? null,
        known_replied: input.knownReplied,
        sent_text: input.sentText ?? null,
        note: input.note ?? null,
        active: true,
      })
      .select('*')
      .single()
    if (error) throw error
    const r = data as Row
    return {
      id: r.id as string,
      leadId: r.lead_id as string,
      knownReplied: Boolean(r.known_replied),
      sentText: (r.sent_text as string) ?? '',
      note: (r.note as string) ?? null,
      active: Boolean(r.active),
      createdAt: r.created_at as string,
    }
  }

  async removeGoldenCase(id: string): Promise<void> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const { error } = await this.client.from('golden_set').delete().eq('id', id)
    if (error) throw error
  }

  async listEvalRuns(): Promise<import('@/lib/store/types').EvalRunRow[]> {
    const { data, error } = await this.client
      .from('eval_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return (data ?? []).map((r: Row) => ({
      id: r.id as string,
      promptVersion: r.prompt_version as string,
      goldenSetSize: r.golden_set_size as number,
      replyRateScore: r.reply_rate_score as number,
      selfCheckPassRate: r.self_check_pass_rate as number,
      companyMentionRate: r.company_mention_rate as number,
      evidenceMentionRate: r.evidence_mention_rate as number,
      overallScore: r.overall_score as number,
      details: r.details as unknown,
      createdAt: r.created_at as string,
    }))
  }

  async saveEvalRun(
    run: Omit<import('@/lib/store/types').EvalRunRow, 'id' | 'createdAt'>,
  ): Promise<import('@/lib/store/types').EvalRunRow> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const { data, error } = await this.client
      .from('eval_runs')
      .insert({
        prompt_version: run.promptVersion,
        golden_set_size: run.goldenSetSize,
        reply_rate_score: run.replyRateScore,
        self_check_pass_rate: run.selfCheckPassRate,
        company_mention_rate: run.companyMentionRate,
        evidence_mention_rate: run.evidenceMentionRate,
        overall_score: run.overallScore,
        details: run.details ?? null,
      })
      .select('*')
      .single()
    if (error) throw error
    const r = data as Row
    return {
      id: r.id as string,
      promptVersion: r.prompt_version as string,
      goldenSetSize: r.golden_set_size as number,
      replyRateScore: r.reply_rate_score as number,
      selfCheckPassRate: r.self_check_pass_rate as number,
      companyMentionRate: r.company_mention_rate as number,
      evidenceMentionRate: r.evidence_mention_rate as number,
      overallScore: r.overall_score as number,
      details: r.details as unknown,
      createdAt: r.created_at as string,
    }
  }

  // ==========================================================================
  // Few-shot wins
  // ==========================================================================

  async listFewShotWins(limit = 100): Promise<import('@/lib/store/types').FewShotWin[]> {
    const { data, error } = await this.client
      .from('few_shot_wins')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []).map((r: Row) => ({
      id: r.id as string,
      messageId: r.message_id as string,
      leadId: r.lead_id as string,
      playId: (r.play_id as string) ?? null,
      signalType: (r.signal_type as number) ?? null,
      sentText: r.sent_text as string,
      company: r.company as string,
      signalEvidence: (r.signal_evidence as string) ?? null,
      tags: (r.tags as string[]) ?? [],
      createdAt: r.created_at as string,
    }))
  }

  async refreshFewShotWins(): Promise<number> {
    if (this.rep.role !== 'admin') throw new Error('Admin only')
    const { data, error } = await this.client.rpc('refresh_few_shot_wins')
    if (error) throw error
    return (data as number) ?? 0
  }

  // ==========================================================================
  // Upwork jobs
  // ==========================================================================

  async createUpworkJob(input: {
    title: string
    description: string
    budgetMin?: number | null
    budgetMax?: number | null
    hourlyRateMin?: number | null
    hourlyRateMax?: number | null
    proposalCount?: number | null
    connectsCost?: number
    requiredSkills?: string[]
    urgencySignal?: string | null
    rawInput?: string | null
    tags?: string[]
  }): Promise<UpworkJob> {
    const { data, error } = await this.client
      .from('upwork_jobs')
      .insert({
        owner_rep_id: this.rep.id,
        title: input.title.trim(),
        description: input.description.trim(),
        budget_min: input.budgetMin ?? null,
        budget_max: input.budgetMax ?? null,
        hourly_rate_min: input.hourlyRateMin ?? null,
        hourly_rate_max: input.hourlyRateMax ?? null,
        proposal_count: input.proposalCount ?? null,
        connects_cost: input.connectsCost ?? 0,
        required_skills: input.requiredSkills ?? [],
        urgency_signal: input.urgencySignal ?? null,
        raw_input: input.rawInput ?? null,
        tags: input.tags ?? [],
      })
      .select('*')
      .single()
    if (error) throw error
    return mapUpworkJob(data as Row)
  }

  async getUpworkJob(id: string) {
    const { data, error } = await this.client
      .from('upwork_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const messages = await this.client
      .from('upwork_messages')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false })
      .then((r) => {
        if (r.error) throw r.error
        return (r.data ?? []).map(mapUpworkMessage)
      })
    return { ...mapUpworkJob(data as Row), messages }
  }

  async listUpworkJobs(): Promise<UpworkJob[]> {
    const { data, error } = await this.client
      .from('upwork_jobs')
      .select('*')
      .eq('owner_rep_id', this.rep.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(mapUpworkJob)
  }

  async updateUpworkJobScore(
    id: string,
    score: { total: number; verdict: UpworkJob['verdict'] },
  ): Promise<void> {
    const { error } = await this.client
      .from('upwork_jobs')
      .update({ score: score.total, verdict: score.verdict })
      .eq('id', id)
      .eq('owner_rep_id', this.rep.id)
    if (error) throw error
  }

  async saveUpworkDraft(input: {
    jobId: string
    type: UpworkMessage['type']
    draftText: string
    modelUsed: string
  }): Promise<UpworkMessage> {
    const { data, error } = await this.client
      .from('upwork_messages')
      .insert({
        job_id: input.jobId,
        rep_id: this.rep.id,
        type: input.type,
        draft_text: input.draftText,
        model_used: input.modelUsed,
      })
      .select('*')
      .single()
    if (error) throw error
    return mapUpworkMessage(data as Row)
  }

  async markUpworkApplied(
    jobId: string,
    sentText: string,
    type: UpworkMessage['type'] = 'cover',
  ): Promise<void> {
    await Promise.all([
      this.client
        .from('upwork_jobs')
        .update({ status: 'applied' })
        .eq('id', jobId)
        .eq('owner_rep_id', this.rep.id),
      this.client.from('upwork_messages').insert({
        job_id: jobId,
        rep_id: this.rep.id,
        type,
        sent_text: sentText,
        sent_at: new Date().toISOString(),
      }),
    ])
  }

  // ==========================================================================
  // CSV imports
  // ==========================================================================

  async logCsvImport(
    input: Omit<CsvImport, 'id' | 'createdAt'>,
  ): Promise<CsvImport> {
    const { data, error } = await this.client
      .from('csv_imports')
      .insert({
        rep_id: this.rep.id,
        file_name: input.fileName ?? null,
        total_rows: input.totalRows,
        imported: input.imported,
        duplicates: input.duplicates,
        invalid: input.invalid,
        details: input.details ?? null,
      })
      .select('*')
      .single()
    if (error) throw error
    const r = data as Row
    return {
      id: r.id as string,
      repId: r.rep_id as string,
      fileName: (r.file_name as string) ?? null,
      totalRows: r.total_rows as number,
      imported: r.imported as number,
      duplicates: r.duplicates as number,
      invalid: r.invalid as number,
      details: r.details as unknown,
      createdAt: r.created_at as string,
    }
  }

  async listCsvImports(): Promise<CsvImport[]> {
    const { data, error } = await this.client
      .from('csv_imports')
      .select('*')
      .eq('rep_id', this.rep.id)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r: Row) => ({
      id: r.id as string,
      repId: r.rep_id as string,
      fileName: (r.file_name as string) ?? null,
      totalRows: r.total_rows as number,
      imported: r.imported as number,
      duplicates: r.duplicates as number,
      invalid: r.invalid as number,
      details: r.details as unknown,
      createdAt: r.created_at as string,
    }))
  }

  // ==========================================================================
  // Archive search
  // ==========================================================================

  async archiveSearch(opts: {
    query: string
    entityFilter?: 'lead' | 'proof' | 'upwork' | 'all'
    statusFilter?: string[]
    signalFilter?: number[]
    playFilter?: string[]
    repFilter?: string[]
    dateFrom?: string | null
    dateTo?: string | null
    limit?: number
  }): Promise<
    Array<{
      entityType: string
      id: string
      title: string
      subtitle: string
      status: string | null
      createdAt: string
      rank: number
    }>
  > {
    const { data, error } = await this.client.rpc('archive_search', {
      query: opts.query,
      entity_filter: opts.entityFilter ?? 'all',
      status_filter: opts.statusFilter ?? [],
      signal_filter: opts.signalFilter ?? [],
      play_filter: opts.playFilter ?? [],
      rep_filter: opts.repFilter ?? [],
      date_from: opts.dateFrom ?? null,
      date_to: opts.dateTo ?? null,
      result_limit: opts.limit ?? 20,
    })
    if (error) throw error
    return (data ?? []).map((r: Row) => ({
      entityType: r.entity_type as string,
      id: r.id as string,
      title: r.title as string,
      subtitle: r.subtitle as string,
      status: (r.status as string) ?? null,
      createdAt: r.created_at as string,
      rank: (r.rank as number) ?? 0,
    }))
  }

  // ==========================================================================
  // Push subscriptions
  // ==========================================================================

  async savePushSubscription(
    sub: Omit<PushSubscription, 'id' | 'createdAt'>,
  ): Promise<PushSubscription> {
    const { data, error } = await this.client
      .from('push_subscriptions')
      .upsert(
        {
          rep_id: sub.repId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
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
      endpoint: r.endpoint as string,
      p256dh: r.p256dh as string,
      auth: r.auth as string,
      createdAt: r.created_at as string,
    }
  }

  async getPushSubscription(repId: string): Promise<PushSubscription | null> {
    const { data, error } = await this.client
      .from('push_subscriptions')
      .select('*')
      .eq('rep_id', repId)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const r = data as Row
    return {
      id: r.id as string,
      repId: r.rep_id as string,
      endpoint: r.endpoint as string,
      p256dh: r.p256dh as string,
      auth: r.auth as string,
      createdAt: r.created_at as string,
    }
  }

  async deletePushSubscription(repId: string): Promise<void> {
    const { error } = await this.client
      .from('push_subscriptions')
      .delete()
      .eq('rep_id', repId)
    if (error) throw error
  }

  // ==========================================================================
  // Notifications
  // ==========================================================================

  async listNotifications(): Promise<NotificationLogEntry[]> {
    const { data, error } = await this.client
      .from('notification_log')
      .select('*')
      .eq('rep_id', this.rep.id)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return (data ?? []).map((r: Row) => ({
      id: r.id as string,
      repId: r.rep_id as string,
      type: r.type as NotificationLogEntry['type'],
      payload: r.payload as Record<string, unknown>,
      read: Boolean(r.read),
      createdAt: r.created_at as string,
    }))
  }

  async markNotificationRead(id: string): Promise<void> {
    const { error } = await this.client
      .from('notification_log')
      .update({ read: true })
      .eq('id', id)
      .eq('rep_id', this.rep.id)
    if (error) throw error
  }
}

function mapUpworkJob(r: Row): UpworkJob {
  return {
    id: r.id as string,
    ownerRepId: (r.owner_rep_id as string) ?? null,
    title: r.title as string,
    description: r.description as string,
    budgetMin: (r.budget_min as number) ?? null,
    budgetMax: (r.budget_max as number) ?? null,
    hourlyRateMin: (r.hourly_rate_min as number) ?? null,
    hourlyRateMax: (r.hourly_rate_max as number) ?? null,
    proposalCount: (r.proposal_count as number) ?? null,
    connectsCost: (r.connects_cost as number) ?? 0,
    requiredSkills: (r.required_skills as string[]) ?? [],
    urgencySignal: (r.urgency_signal as string) ?? null,
    score: (r.score as number) ?? null,
    verdict: (r.verdict as UpworkJob['verdict']) ?? null,
    status: (r.status as UpworkJob['status']) ?? 'new',
    extractedFields: (r.extracted_fields as Record<string, unknown>) ?? null,
    rawInput: (r.raw_input as string) ?? null,
    tags: (r.tags as string[]) ?? [],
    createdAt: r.created_at as string,
  }
}

function mapUpworkMessage(r: Row): UpworkMessage {
  return {
    id: r.id as string,
    jobId: r.job_id as string,
    repId: (r.rep_id as string) ?? null,
    type: r.type as UpworkMessage['type'],
    draftText: (r.draft_text as string) ?? null,
    sentText: (r.sent_text as string) ?? null,
    sentAt: (r.sent_at as string) ?? null,
    modelUsed: (r.model_used as string) ?? null,
    createdAt: r.created_at as string,
  }
}
