import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export type Freshness = 'fresh' | 'stale' | 'dead'

export function formatRelativeTime(
  dateStr: string,
  now: Date = new Date(),
): { text: string; freshness: Freshness; title: string } {
  const date = new Date(dateStr.replace(' ', 'T'))
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  const title = dateStr

  if (diffDay > 30) {
    const month = date.toLocaleString('en', { month: 'short' })
    return { text: `${month} ${date.getDate()}`, freshness: 'dead', title }
  }

  if (diffDay >= 7) {
    return { text: `${diffDay}d ago`, freshness: 'stale', title }
  }

  if (diffDay >= 1) {
    return { text: `${diffDay}d ago`, freshness: 'fresh', title }
  }

  if (diffHour >= 1) {
    return { text: `${diffHour}h ago`, freshness: 'fresh', title }
  }

  if (diffMin >= 1) {
    return { text: `${diffMin}m ago`, freshness: 'fresh', title }
  }

  return { text: `${diffSec}s ago`, freshness: 'fresh', title }
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}
