import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: fileURLToPath(new URL('.', import.meta.url)),
    envDir: false,
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:' + (env.PORT || '3001') },
    },
  }
})
