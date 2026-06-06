import {
  History,
  Loader2,
  LogOut,
  Moon,
  SquareTerminal,
  Sun,
  Table2,
  Workflow,
  Zap,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores/connection-store'
import { useDatabaseFilterStore } from '@/stores/database-filter-store'
import { useGraphStore } from '@/stores/graph-store'
import { useHistoryStore } from '@/stores/history-store'
import { useSchemaStore } from '@/stores/schema-store'
import { useThemeStore } from '@/stores/theme-store'
import { getRouteTitle } from './route-meta'

const navItems = [
  { path: '/', icon: Workflow, label: 'Graph', key: '1' },
  { path: '/tables', icon: Table2, label: 'Tables', key: '2' },
  { path: '/impact', icon: Zap, label: 'Impact', key: '3' },
  { path: '/playground', icon: SquareTerminal, label: 'Playground', key: '4' },
  { path: '/history', icon: History, label: 'History', key: '5' },
]

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const title = getRouteTitle(location.pathname)
  const { host, port, isConnected, disconnect, mode } = useConnectionStore()
  const schemaStatus = useSchemaStore((s) => s.status)
  const schemaWarnings = useSchemaStore((s) => s.warnings)
  const restoreAttempted = useRef(false)

  // Auto-reconnect from localStorage on page load
  useEffect(() => {
    if (isConnected || restoreAttempted.current) return
    restoreAttempted.current = true

    const params = useConnectionStore.getState().restoreFromStorage()
    if (!params) {
      void navigate('/connect')
      return
    }

    void useConnectionStore
      .getState()
      .connect(params)
      .then((ok) => {
        if (!ok) {
          void navigate('/connect')
        }
      })
  }, [isConnected, navigate])

  // Trigger schema loading when connected but schema not yet loaded
  useEffect(() => {
    if (isConnected && schemaStatus === 'idle') {
      const params = useConnectionStore.getState().getParams()
      void useSchemaStore.getState().loadSchema(params, { mode })
    }
  }, [isConnected, mode, schemaStatus])

  // Keyboard shortcuts: 1-5 nav, / focus search, Esc
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'

      if (isInput) return

      // 1-6 for page navigation
      const navItem = navItems.find((item) => item.key === e.key)
      if (navItem) {
        e.preventDefault()
        void navigate(navItem.path)
        return
      }

      // / to focus search input
      if (e.key === '/') {
        e.preventDefault()
        const input = document.querySelector<HTMLInputElement>('input[placeholder*="Filter"]')
        input?.focus()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [navigate])

  const displayHost = `${host}:${port}`

  function handleDisconnect() {
    void disconnect().finally(() => {
      useSchemaStore.getState().reset()
      useGraphStore.getState().reset()
      useHistoryStore.getState().reset()
      useDatabaseFilterStore.getState().setSelectedDatabase('')
      void navigate('/connect')
    })
  }

  const { theme, toggle: toggleTheme } = useThemeStore()

  if (!isConnected) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden min-w-[1024px]">
      {/* Sidebar */}
      <aside className="flex w-[52px] flex-col items-center border-r border-border bg-card py-3 gap-1">
        <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary font-bold text-xs">
          ct
        </div>
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive =
            item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)
          return (
            <button
              key={item.path}
              onClick={() => {
                void navigate(item.path)
              }}
              title={`${item.label} (${item.key})`}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-md transition-colors',
                isActive
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon size={18} />
            </button>
          )
        })}

        <div className="mt-auto flex flex-col items-center gap-1">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={handleDisconnect}
            title="Disconnect"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-12 items-center justify-between border-b border-border bg-card px-4">
          <h1 className="text-sm font-medium">{title}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {schemaStatus === 'loading' && (
              <div className="flex items-center gap-2">
                <div className="h-1 w-24 rounded-full bg-muted overflow-hidden">
                  <div className="h-full w-1/2 rounded-full bg-primary animate-pulse" />
                </div>
                <span className="text-muted-foreground/60">Loading schema...</span>
              </div>
            )}
            {schemaWarnings.length > 0 && (
              <span
                className="rounded border border-amber-500/40 px-1.5 py-0.5 text-[10px] uppercase text-amber-600 dark:text-amber-300"
                title={schemaWarnings.map((warning) => warning.message).join('\n')}
              >
                {schemaWarnings.length} warnings
              </span>
            )}
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              {mode === 'server' ? 'Server' : 'Direct'}
            </span>
            {displayHost}
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
