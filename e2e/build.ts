import { build } from 'vite'

export default async function buildTests() {
  const cache = 'node_modules/.cache/sladit-e2e'
  await build({ build: { outDir: cache } })
  // Vite zpracuje stejné importy SQL migrací a podkladů jako při sestavení aplikace.
  await build({
    build: {
      ssr: 'e2e/server.ts',
      outDir: cache + '-server',
      rollupOptions: { output: { entryFileNames: 'server.mjs' } },
    },
  })
}
