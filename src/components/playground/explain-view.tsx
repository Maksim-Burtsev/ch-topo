import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'
import type { ExplainMode, ExplainResult } from '@/lib/playground/explain'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────

const MODES: { value: ExplainMode; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'syntax', label: 'Syntax' },
]

// ── Component ─────────────────────────────────────────────────

interface ExplainViewProps {
  result: ExplainResult
  onModeChange: (mode: ExplainMode) => void
  className?: string
}

export function ExplainView({ result, onModeChange, className }: ExplainViewProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 1500)
    }, () => {
      // clipboard write failed
    })
  }, [result.text])

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <TabSelector activeMode={result.mode} onModeChange={onModeChange} />
        <div className="flex-1" />
        {result.text && (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        )}
      </div>

      <div className="overflow-auto">
        <ExplainContent result={result} />
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

interface TabSelectorProps {
  activeMode: ExplainMode
  onModeChange: (mode: ExplainMode) => void
}

function ExplainContent({ result }: { result: ExplainResult }) {
  if (result.error) {
    return (
      <div className="px-3 py-4 text-sm text-destructive">
        {result.error}
      </div>
    )
  }

  if (result.text) {
    return (
      <pre className="whitespace-pre p-3 text-xs leading-5 font-mono text-foreground">
        {result.text}
      </pre>
    )
  }

  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      No explain output
    </div>
  )
}

function TabSelector({ activeMode, onModeChange }: TabSelectorProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-secondary/50 p-0.5">
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => { onModeChange(value) }}
          className={cn(
            'rounded px-2.5 py-0.5 text-xs transition-colors',
            activeMode === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
