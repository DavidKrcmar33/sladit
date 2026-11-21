import { getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { buildSource, type ReviewBasis } from '../src/llm/review'
import { UnreadableSourceError } from '../src/llm/extract'
import { readContent, testServer } from '../server/testing'

const root = './node_modules/.cache/sladit-e2e'
const period = { from: '2026-11-23', to: '2026-12-06' }
const basis: ReviewBasis = {
  period,
  notes: [],
  extraWarnings: [],
  readings: [
    {
      documentKind: 'timetable',
      readability: 'good',
      people: 'one',
      legend: '',
      weekParity: 'unstated',
      coverage: [period],
      dated: [],
      warnings: [],
      weekly: [
        {
          weekday: 'tue',
          weeks: 'odd',
          start: '06:00',
          end: '14:00',
          label: 'R',
          raw: 'R?',
          source: 'řádek 1',
          uncertain: true,
          exceptDates: [],
        },
      ],
    },
  ],
}

export async function startServer(env: Record<string, string>) {
  const http = createServer()
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const origin = 'http://127.0.0.1:' + (http.address() as AddressInfo).port
  let now = Date.now()
  try {
    const { app, db, calendar } = await testServer(
      { APP_ORIGIN: origin, ...env },
      async ({ sources }) => {
        const text = sources.map(({ part }) => ('text' in part ? part.text : '')).join('\n')
        if (text.includes('Nečitelný rozpis')) throw new UnreadableSourceError('Nečitelný rozpis')
        if (text.includes('Model je vytížený')) throw new Error('429')
        if (text.includes('Lichá úterý'))
          return { source: { ...readContent, ...buildSource(basis, []) }, basis }
        return readContent
      },
      () => new Date(now),
      async () => ({
        reply: 'Směna začíná v 07:00.',
        answers: [
          {
            kind: 'shift',
            raw: 'R?',
            start: '06:00',
            end: '14:00',
            change: { type: 'time', start: '07:00', end: '14:00' },
          },
        ],
      }),
    )
    app.use('*', serveStatic({ root }))
    app.get('/pozvanka/:token', serveStatic({ path: `${root}/index.html` }))
    http.on('request', getRequestListener(app.fetch))
    return {
      origin,
      calendar,
      advanceDays(days: number) {
        now += days * 86_400_000
      },
      async close() {
        const closed = once(http, 'close')
        http.close()
        http.closeAllConnections()
        await closed
        await db.close()
      },
    }
  } catch (error) {
    http.close()
    throw error
  }
}
