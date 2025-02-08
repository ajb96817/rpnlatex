
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: 'build'
  },
  server: {
    port: 3000
  }
})
