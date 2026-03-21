import { FolderSync } from 'lucide-react'

export function MigrationsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card">
        <FolderSync size={28} className="text-muted-foreground" />
      </div>
      <h2 className="text-lg font-medium mb-2">Migrations</h2>
      <p className="text-sm text-muted-foreground max-w-md">
        Drag & drop a migrations folder to diff your schema against the live state. Supports
        PyClickHouseMigrator, golang-migrate, Atlas, and plain SQL.
      </p>
      <div className="mt-6 rounded-lg border-2 border-dashed border-border px-12 py-8 text-sm text-muted-foreground">
        Drop migrations folder here
      </div>
    </div>
  )
}
