import { FolderSync, History, LogOut, Table2, Workflow, Zap } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores/connection-store'

const navItems = [
  { path: '/', icon: Workflow, label: 'Graph' },
  { path: '/tables', icon: Table2, label: 'Tables' },
  { path: '/impact', icon: Zap, label: 'Impact' },
  { path: '/history', icon: History, label: 'History' },
  { path: '/migrations', icon: FolderSync, label: 'Migrations' },
]

function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Schema Graph'
  if (pathname === '/tables') return 'Tables'
  if (pathname.startsWith('/tables/')) return 'Table Detail'
  if (pathname === '/impact') return 'Impact Analysis'
  if (pathname === '/history') return 'DDL History'
  if (pathname === '/migrations') return 'Migrations'
  return 'chtopo'
}

export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const title = getPageTitle(location.pathname)
  const { host, port, isConnected, error, disconnect } = useConnectionStore()

  const hasError = !!error
  const displayHost = isConnected ? `${host}:${port}` : 'Not connected'

  function handleDisconnect() {
    disconnect()
    void navigate('/connect')
  }

  return (
    <div className="flex h-screen overflow-hidden">
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
              title={item.label}
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

        <div className="mt-auto">
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
            {isConnected ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    'relative inline-flex h-2 w-2 rounded-full',
                    hasError ? 'bg-red-500' : 'bg-zinc-500',
                  )}
                />
              </span>
            )}
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
