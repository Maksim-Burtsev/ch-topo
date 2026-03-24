import Editor, { type OnMount } from '@monaco-editor/react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import {
  buildSchemaLookup,
  registerSqlCompletionProvider,
  type SchemaDatabase,
} from '@/lib/playground/autocomplete'
import { useSchemaStore } from '@/stores/schema-store'
import { useThemeStore } from '@/stores/theme-store'

export interface SqlEditorHandle {
  /** Returns selected text, or null if no selection */
  getSelection: () => string | null
  /** Returns 0-based offset of the cursor in the full text */
  getCursorOffset: () => number
}

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { value, onChange, className },
  ref,
) {
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

  useImperativeHandle(ref, () => ({
    getSelection() {
      const editor = editorRef.current
      if (!editor) return null
      const selection = editor.getSelection()
      if (!selection || selection.isEmpty()) return null
      return editor.getModel()?.getValueInRange(selection) ?? null
    },
    getCursorOffset() {
      const editor = editorRef.current
      if (!editor) return 0
      const position = editor.getPosition()
      const model = editor.getModel()
      if (!position || !model) return 0
      return model.getOffsetAt(position)
    },
  }))

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
})
