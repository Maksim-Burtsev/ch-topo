import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useEffect, useRef } from 'react'
import {
  buildSchemaLookup,
  registerSqlCompletionProvider,
  type SchemaDatabase,
} from '@/lib/playground/autocomplete'
import { useSchemaStore } from '@/stores/schema-store'
import { useThemeStore } from '@/stores/theme-store'

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SqlEditor({ value, onChange, className }: SqlEditorProps) {
  const theme = useThemeStore((s) => s.theme)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const schemaRef = useRef<SchemaDatabase[]>([])
  const disposableRef = useRef<{ dispose: () => void } | null>(null)

  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)
  const columnsReady = useSchemaStore((s) => s.columnsReady)

  useEffect(() => {
    if (columnsReady) {
      schemaRef.current = buildSchemaLookup(tables, columns)
    }
  }, [tables, columns, columnsReady])

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    editor.focus()

    disposableRef.current = registerSqlCompletionProvider(
      monaco as Parameters<typeof registerSqlCompletionProvider>[0],
      () => schemaRef.current,
    )
  }, [])

  useEffect(() => {
    return () => {
      disposableRef.current?.dispose()
    }
  }, [])

  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? '')
    },
    [onChange],
  )

  return (
    <div className={className} style={{ flex: 1, minHeight: 0 }}>
      <Editor
        language="sql"
        theme={theme === 'dark' ? 'vs-dark' : 'light'}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'on',
          wordWrap: 'on',
          fontSize: 14,
          fontFamily: 'monospace',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 8 },
        }}
      />
    </div>
  )
}
