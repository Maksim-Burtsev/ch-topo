import type { BadgeVariant } from './badge'

export function getEngineVariant(engine: string): BadgeVariant {
  const e = engine.toLowerCase()
  if (e.includes('materializedview')) return 'mv'
  if (e.includes('aggregating')) return 'aggregating'
  if (e.includes('summing')) return 'summing'
  if (e.includes('replacing')) return 'replacing'
  if (e.includes('distributed')) return 'distributed'
  if (e.includes('dictionary')) return 'dictionary'
  if (e.includes('mergetree')) return 'mergetree'
  return 'secondary'
}
