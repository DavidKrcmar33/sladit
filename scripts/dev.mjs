// Vývoj jedním příkazem: Vite pro frontend a server s API, který se po změně sám restartuje.
// Vite přeposílá /api na server (vite.config.ts), takže obojí běží na stejném původu.
import { spawn } from 'node:child_process'

const processes = [
  ['web', ['vite']],
  ['api', ['vite-node', '--watch', 'server/main.ts']],
].map(([name, args]) => {
  const child = spawn('npx', args, { stdio: ['inherit', 'pipe', 'pipe'], env: process.env })
  const prefix = `[${name}] `
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString().replace(/\n(?!$)/g, `\n${prefix}`)
      process.stdout.write(prefix + text)
    })
  }
  child.on('exit', (code) => {
    console.log(`${prefix}skončil (${code ?? 'signál'})`)
    for (const other of processes) if (other !== child) other.kill()
    process.exit(code ?? 0)
  })
  return child
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    for (const child of processes) child.kill(signal)
  })
}
