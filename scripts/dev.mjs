// Vývoj jedním příkazem: Vite pro frontend a server s API, který se po změně sám restartuje.
// Vite přeposílá /api na server (vite.config.ts), takže obojí běží na stejném původu.
//
// API se restartuje jako nový proces, ne uvnitř běžícího (vite-node --watch). Starý proces
// dostane SIGTERM, zavře databázi a skončí, a teprve pak se spustí nový. Nad adresářem PGlite
// tak nikdy neběží dvě instance najednou, což databázi poškodí.
import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { fileURLToPath } from 'node:url'

const viteNode = fileURLToPath(new URL('../node_modules/vite-node/vite-node.mjs', import.meta.url))

function pipeOutput(name, child) {
  const prefix = `[${name}] `
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString().replace(/\n(?!$)/g, `\n${prefix}`)
      process.stdout.write(prefix + text)
    })
  }
}

const web = spawn('npx', ['vite'], { stdio: ['inherit', 'pipe', 'pipe'], env: process.env })
pipeOutput('web', web)

let api = null
let restarting = false
let restartAgain = false

function startApi() {
  const child = spawn(process.execPath, [viteNode, 'server/main.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  pipeOutput('api', child)
  child.on('exit', (code, signal) => {
    if (api === child) api = null
    if (!restarting) console.log(`[api] skončil (${code ?? signal}), čekám na změnu souboru`)
  })
  api = child
}

/** Zastaví běžící API, počká, až skončí, a spustí nové. Změny během čekání sloučí do jedné. */
function restartApi() {
  if (restarting) {
    restartAgain = true
    return
  }
  const running = api
  if (!running) return startApi()
  restarting = true
  running.once('exit', () => {
    restarting = false
    startApi()
    if (restartAgain) {
      restartAgain = false
      restartApi()
    }
  })
  running.kill('SIGTERM')
}

// Restart jen při změně kódu, který server opravdu používá.
const WATCHED = [
  ['server', () => true],
  ['src', (file) => /^(core|contract|llm)[/\\]/.test(file)],
]
let timer = null
for (const [dir, relevant] of WATCHED) {
  watch(dir, { recursive: true }, (_event, file) => {
    if (!file || /\.test\.ts$/.test(file) || !relevant(file)) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      console.log(`[api] změna ${dir}/${file}, restartuji`)
      restartApi()
    }, 300)
  })
}

startApi()

web.on('exit', (code) => {
  console.log(`[web] skončil (${code ?? 'signál'})`)
  api?.kill('SIGTERM')
  process.exit(code ?? 0)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    web.kill(signal)
    api?.kill(signal)
  })
}
