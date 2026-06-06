import { Cable, Database, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { loadStoredConnection, toConnectionParams } from '@/lib/connection-storage'
import type { ConnectionMode } from '@/stores/connection-store'
import { useConnectionStore } from '@/stores/connection-store'
import { useSchemaStore } from '@/stores/schema-store'

function getConnectButtonLabel(mode: ConnectionMode) {
  if (mode === 'server') return 'Connect via Server Mode'
  if (mode === 'direct') return 'Connect via Direct Mode'
  return 'Explore Demo Mode'
}

function getConnectSubtitle(mode: ConnectionMode) {
  if (mode === 'server') return 'Server-side session through the ch-topo API'
  if (mode === 'direct') return 'Direct HTTP connection from this browser'
  return 'Bundled sample schema, no ClickHouse required'
}

export function ConnectPage() {
  const navigate = useNavigate()
  const { isConnecting, error, connect } = useConnectionStore()
  const [saved] = useState(() => loadStoredConnection())
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('server')

  const [host, setHost] = useState(saved?.host ?? 'localhost')
  const [port, setPort] = useState(String(saved?.port ?? 8123))
  const [database, setDatabase] = useState(saved?.database ?? 'default')
  const [user, setUser] = useState(saved?.user ?? 'default')
  const [password, setPassword] = useState('')
  const autoConnectRef = useRef(false)
  const connectButtonLabel = getConnectButtonLabel(connectionMode)

  useEffect(() => {
    if (autoConnectRef.current) return
    autoConnectRef.current = true

    if (saved) {
      const params = toConnectionParams(saved)
      void connect(params, { mode: 'direct' }).then((ok) => {
        if (ok) {
          void useSchemaStore.getState().loadSchema(params)
          void navigate('/')
        }
      })
    }
  }, [connect, navigate, saved])

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    const params =
      connectionMode === 'demo'
        ? { host: 'demo', port: 0, database: 'demo', user: 'demo', password: '' }
        : {
            host,
            port: parseInt(port, 10) || 8123,
            database,
            user,
            password,
          }
    void connect(params, { mode: connectionMode }).then((ok) => {
      if (ok) {
        void useSchemaStore.getState().loadSchema(params, { mode: connectionMode })
        void navigate('/')
      }
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
            <Database size={24} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Connect to ClickHouse</h1>
          <p className="mt-1 text-sm text-muted-foreground">{getConnectSubtitle(connectionMode)}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 rounded-lg border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => {
                setConnectionMode('server')
              }}
              className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs transition-colors ${
                connectionMode === 'server'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldCheck size={14} />
              Server Mode
            </button>
            <button
              type="button"
              onClick={() => {
                setConnectionMode('demo')
              }}
              className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs transition-colors ${
                connectionMode === 'demo'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles size={14} />
              Demo Mode
            </button>
            <button
              type="button"
              onClick={() => {
                setConnectionMode('direct')
              }}
              className={`flex h-9 items-center justify-center gap-2 rounded-md text-xs transition-colors ${
                connectionMode === 'direct'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Cable size={14} />
              Direct Mode
            </button>
          </div>

          {connectionMode === 'server' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs leading-relaxed text-emerald-700 dark:text-emerald-200">
              Server Mode stores ClickHouse credentials only in the ch-topo API session. The browser
              receives an httpOnly session cookie.
            </div>
          )}
          {connectionMode === 'direct' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-200">
              Direct Mode is for local or trusted internal ClickHouse only. The browser sends
              credentials directly to ClickHouse; passwords are used for this session and are never
              saved.
            </div>
          )}
          {connectionMode === 'demo' && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-xs leading-relaxed text-sky-700 dark:text-sky-200">
              Demo Mode loads a bundled sample schema in this browser. It is not connected to a real
              ClickHouse instance and cannot execute queries.
            </div>
          )}

          {connectionMode !== 'demo' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs text-muted-foreground">Host</label>
                  <Input
                    value={host}
                    onChange={(e) => {
                      setHost(e.target.value)
                    }}
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Port</label>
                  <Input
                    value={port}
                    onChange={(e) => {
                      setPort(e.target.value)
                    }}
                    placeholder="8123"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Database</label>
                <Input
                  value={database}
                  onChange={(e) => {
                    setDatabase(e.target.value)
                  }}
                  placeholder="default"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">User</label>
                <Input
                  value={user}
                  onChange={(e) => {
                    setUser(e.target.value)
                  }}
                  placeholder="default"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-muted-foreground">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                  }}
                  placeholder="Optional"
                />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-400 leading-relaxed break-words">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isConnecting}>
            {isConnecting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting...
              </>
            ) : (
              connectButtonLabel
            )}
          </Button>
        </form>

        {connectionMode === 'direct' && (
          <p className="mt-6 text-center text-xs text-muted-foreground leading-relaxed">
            Requires ClickHouse HTTP interface on the specified port.
            <br />
            CORS must be enabled:{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
              {'<allow_origin>*</allow_origin>'}
            </code>
          </p>
        )}
      </div>
    </div>
  )
}
