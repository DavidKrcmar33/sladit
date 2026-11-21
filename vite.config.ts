import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ isSsrBuild, mode }) => ({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Sestavení serveru (`vite build --ssr server/main.ts`) je pro Node, bez obrázků z public/.
  build: isSsrBuild ? { target: 'node22', copyPublicDir: false } : undefined,
  // ExcelJS se načítá až při čtení. Bez předpřipravení by ho Vite ve vývoji objevil až tehdy
  // a stránku by znovu načetl, čímž by se ztratily vložené soubory.
  optimizeDeps: { include: ['exceljs'] },
  // Ve vývoji jde API na server z `npm run dev` (server/main.ts), stejný původ jako frontend.
  server: {
    proxy: { '/api': { target: 'http://localhost:8787' } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'eval/**/*.test.ts', 'server/**/*.test.ts'],
    setupFiles: mode === 'db-profile' ? ['./scripts/profile-db.ts'] : [],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{ts,vue}', 'server/**/*.ts'],
      exclude: ['**/*.test.ts', 'server/testing.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
    },
  },
}))
