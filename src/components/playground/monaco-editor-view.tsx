import Editor, { type OnMount } from '@monaco-editor/react'

interface MonacoEditorViewProps {
  language: string
  theme: string
  value: string
  onChange: (value: string | undefined) => void
  onMount: OnMount
}

export type MonacoEditorOnMount = OnMount

export function MonacoEditorView({
  language,
  theme,
  value,
  onChange,
  onMount,
}: MonacoEditorViewProps) {
  return (
    <Editor
      language={language}
      theme={theme}
      value={value}
      onChange={onChange}
      onMount={onMount}
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
  )
}
