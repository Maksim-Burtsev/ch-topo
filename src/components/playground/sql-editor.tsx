import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useRef } from 'react'
import { useThemeStore } from '@/stores/theme-store'

interface SqlEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

export function SqlEditor({ value, onChange, className }: SqlEditorProps) {
  const theme = useThemeStore((s) => s.theme)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    editor.focus()
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
