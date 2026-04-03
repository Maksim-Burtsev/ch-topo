import { ArrowLeft } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router'

export function NotFoundPage() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-8 text-center">
        <p className="text-[120px] leading-none font-bold tracking-tighter text-muted-foreground/15 select-none">
          404
        </p>

        <div className="-mt-4 space-y-2">
          <h2 className="text-lg font-semibold">Page not found</h2>
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
          <ArrowLeft size={14} />
          Back to Graph
        </button>
      </div>
    </div>
  )
}
