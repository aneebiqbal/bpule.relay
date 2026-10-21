import { describe, it, expect } from 'vitest'
import { buildMockStore } from '@/lib/store/mock-store'

const admin = {
  id: 'rep-hassan',
  name: 'Hassan (demo)',
  role: 'admin' as const,
  organizationId: 'org-demo',
  createdAt: new Date().toISOString(),
  timezone: 'UTC',
}

async function makePersona() {
  const store = buildMockStore({ rep: admin, mode: 'demo' })
  const persona = await store.createContentPersona({
    repId: admin.id,
    displayName: 'Test Persona',
    platforms: ['linkedin'],
    humorStyle: 'direct',
    valuesAndOpinions: ['Context before action'],
  })
  const profile = await store.createContentProfile({ personaId: persona.id, role: 'Founder' })
  return { store, personaId: persona.id, profileId: profile.id }
}

describe('Studio persona PATCH field persistence', () => {
  it('updateContentPersona persists persona-scoped fields', async () => {
    const { store, personaId } = await makePersona()
    await store.updateContentPersona({
      personaId,
      personaRole: 'CEO',
      personaCompany: 'Acme',
      personaLocation: 'Remote',
      contentComfort: ['Technical lessons', 'Opinions'],
      onboardingStep: 'complete',
      onboardingCompleted: true,
    })
    const persona = await store.getContentPersona(personaId)
    expect(persona?.personaRole).toBe('CEO')
    expect(persona?.personaCompany).toBe('Acme')
    expect(persona?.personaLocation).toBe('Remote')
    expect(persona?.contentComfort).toEqual(['Technical lessons', 'Opinions'])
    expect(persona?.onboardingStep).toBe('complete')
    expect(persona?.onboardingCompleted).toBe(true)
  })

  it('updateContentProfile persists audiences, territories and voiceSelection', async () => {
    const { store, profileId } = await makePersona()
    await store.updateContentProfile(profileId, {
      audiences: ['CEOs', 'founders', 'investors'],
      territories: ['ai', 'infrastructure', 'engineering culture'],
      voiceSelection: 'direct',
    })
    const profile = await store.getContentProfile(profileId)
    expect(profile?.audiences).toEqual(['CEOs', 'founders', 'investors'])
    expect(profile?.territories).toEqual(['ai', 'infrastructure', 'engineering culture'])
    expect(profile?.voiceSelection).toBe('direct')
  })

  it('updateContentProfile does not drop audiences/territories when updating other fields', async () => {
    const { store, profileId } = await makePersona()
    await store.updateContentProfile(profileId, {
      audiences: ['CEOs'],
      territories: ['ai'],
      voiceSelection: 'direct',
    })
    await store.updateContentProfile(profileId, { role: 'CTO' })
    const profile = await store.getContentProfile(profileId)
    expect(profile?.role).toBe('CTO')
    expect(profile?.audiences).toEqual(['CEOs'])
    expect(profile?.territories).toEqual(['ai'])
    expect(profile?.voiceSelection).toBe('direct')
  })

  it('fields survive a round trip and remain available to reload', async () => {
    const { store, personaId, profileId } = await makePersona()
    await store.updateContentPersona({ personaId, personaRole: 'Founder', onboardingCompleted: true })
    await store.updateContentProfile(profileId, {
      audiences: ['founders', 'tech leaders'],
      territories: ['startups'],
      voiceSelection: 'conversational',
    })
    const persona = await store.getContentPersona(personaId)
    const profile = await store.getContentProfile(profileId)
    expect(persona?.personaRole).toBe('Founder')
    expect(persona?.onboardingCompleted).toBe(true)
    expect(profile?.audiences).toEqual(['founders', 'tech leaders'])
    expect(profile?.territories).toEqual(['startups'])
    expect(profile?.voiceSelection).toBe('conversational')
  })
})
