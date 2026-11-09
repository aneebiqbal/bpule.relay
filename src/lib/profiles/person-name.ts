/**
 * Canonical person display name.
 *
 * A `profiles` row is a sender account; a person may have several. The label
 * on a sender account often carries the channel ("Zaira Upwork",
 * "Mehak, LinkedIn"), which must never be shown as the person's name now that
 * channels are nested under the person.
 */
export function personNameFromProfile(profile: {
  display_name?: string | null
  full_name?: string | null
  label?: string | null
}): string {
  if (profile.display_name) return profile.display_name
  if (profile.full_name) return profile.full_name
  const label = profile.label
  if (!label) return 'Unnamed'
  const stripped = label
    .replace(/[,\s]+\s*(Upwork|LinkedIn|Email|Other)\s*$/i, '')
    .trim()
  return stripped || label
}
