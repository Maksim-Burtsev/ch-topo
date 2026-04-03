import { CircleOff } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

export function NotFoundPage() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center -mt-12">
      <div className="relative">
        <CircleOff size={64} strokeWidth={1} className="text-muted-foreground/30" />
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-muted-foreground/50">
          404
        </span>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Page not found</h2>
        <p className="text-sm text-muted-foreground">
          No route matches{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            {location.pathname}
          </code>
        </p>
      </div>

      <button
        onClick={() => {
          void navigate('/')
        }}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Back to Graph
      </button>
    </div>
  )
}
