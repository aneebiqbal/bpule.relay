/** Content persona access — one rule for every Studio/Ideas surface. */
export interface PersonaScopeUser {
  repId: string
  role: string | null
}

export interface PersonaScopePersona {
  repId: string
}

/** A rep sees their own personas; an admin sees the whole organization. */
export function canViewPersona(persona: PersonaScopePersona, user: PersonaScopeUser): boolean {
  return persona.repId === user.repId || user.role === 'admin'
}
