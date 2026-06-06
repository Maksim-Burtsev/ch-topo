import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/cli/main.ts'),
      formats: ['es'],
      fileName: () => 'chtopo.js',
    },
    outDir: 'dist-cli',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: {
      external: [/^node:/u],
      output: {
        format: 'es',
      },
    },
  },
})
