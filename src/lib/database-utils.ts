/** Compute effective database filter: auto-select when only one DB exists. */
export function getEffectiveDatabase(selected: string, databases: string[]): string {
  if (selected === '' && databases.length === 1) return databases[0] ?? ''
  if (selected && !databases.includes(selected)) return ''
  return selected
}
