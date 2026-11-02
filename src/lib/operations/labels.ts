/** Pure display helpers shared by server loaders and client tables. */
export function leadLabel(contactName: string | null, company: string | null): string {
  const name = contactName?.trim()
  const co = company?.trim()
  if (name && co) return `${name} · ${co}`
  return name || co || 'Untitled lead'
}
