/**
 * Měření: přečte testovací rozpisy modelem, porovná je se správnými směnami
 * a ověří, zda se správný termín objeví mezi 3 návrhy.
 *
 *   npm run eval                       všechno
 *   npm run eval -- --expected-only    jen scheduler nad správnými směnami (bez modelu)
 *   npm run eval -- --only s01,s05     jen vybrané rozpisy (skupiny se pak nepočítají)
 *   npm run eval -- --no-cache         ignoruje uloženou cache odpovědí
 *
 * Cache ukládá surové odpovědi modelu podle obsahu dotazu. Změna kódu (expand, checks, compose)
 * se tak přepočítá bez volání modelu, změna instrukcí nebo vstupu vytvoří nový dotaz sama.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { composeSchedule } from '../src/core/compose'
import { withAnchor } from '../src/core/parity'
import {
  PersonScheduleSchema,
  type ActionParams,
  type DateString,
  type PersonSchedule,
  type SourceContent,
  type SourceFileKind,
} from '../src/core/schema'
import { findUncertainDays } from '../src/core/calendar'
import { attendanceInSlot, findProposals } from '../src/core/scheduler'
import { analyzeStability } from '../src/core/sensitivity'
import { addDays, eachDay } from '../src/core/time'
import { detectSourceFileKind } from '../src/core/sourceFile'
import { llmConfigFromEnv, missingSettings, modelName, type LlmConfig } from '../src/llm/config'
import { depsFromConfig, extractWithReport, type ExtractReport } from '../src/llm/extract'
import { prepareSource } from '../src/llm/ingest'
import { createGenerateJson, type ModelRequest } from '../src/llm/model'
import {
  aggregate,
  compareShifts,
  diffShifts,
  isTopProposalHit,
  type ReadingScore,
  type ShiftCounts,
  type ShiftDiff,
} from './metrics'

const EVAL_DIR = import.meta.dirname
const RESULTS_DIR = join(EVAL_DIR, 'results')
const CACHE_DIR = join(RESULTS_DIR, 'cache', 'requests')

// Je součástí klíče cache. Zvyš, když chceš vynutit nové odpovědi modelu i pro stejné dotazy.
const PIPELINE_VERSION = 6

const RECALL_GOAL = 0.9
/** Podíl skupin, ve kterých má správný termín vyjít i z přečtených rozpisů. */
const HIT_GOAL = 0.8

interface ScheduleCase {
  id: string
  meta: {
    personName: string
    nameInSchedule: string
    from: DateString
    to: DateString
    format: string
    notation: string
    style: string
    legend: boolean
    /** Typy dokumentu, které se uznají jako správně rozpoznané. */
    kinds?: string[]
    /** U rozvrhu s lichými a sudými týdny odpověď, kterou by dal člověk. */
    weekParity?: { date: DateString; odd: boolean }
  }
  fileName: string
  kind: SourceFileKind
  bytes: Buffer
  expected: PersonSchedule
}

interface ScenarioCase {
  id: string
  action: ActionParams & { name: string }
  people: { id: string; name: string; scheduleId: string }[]
  expectedDate: DateString
}

interface ReadResult {
  /** Přečtený zdroj, celý podklad. */
  source: SourceContent | null
  /** Rozpis složený ze zdroje pro hledané období, s tím se porovnává. */
  schedule: PersonSchedule | null
  report: ExtractReport | null
  error: string | null
  cached: boolean
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  txt: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadSchedules(): ScheduleCase[] {
  const root = join(EVAL_DIR, 'data', 'schedules')
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(root, entry.name)
      const fileName = readdirSync(dir).find((name) => name.startsWith('input.'))
      if (!fileName) throw new Error(`${entry.name}: chybí soubor input.*`)
      const extension = fileName.split('.').pop() ?? ''
      const kind = detectSourceFileKind(fileName, MIME_BY_EXTENSION[extension] ?? '')
      if (!kind) throw new Error(`${entry.name}: neznámý formát ${fileName}`)
      return {
        id: entry.name,
        meta: readJson(join(dir, 'meta.json')) as ScheduleCase['meta'],
        fileName,
        kind,
        bytes: readFileSync(join(dir, fileName)),
        expected: PersonScheduleSchema.parse(readJson(join(dir, 'expected.json'))),
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

function loadScenarios(): ScenarioCase[] {
  const root = join(EVAL_DIR, 'data', 'scenarios')
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => readJson(join(root, name)) as ScenarioCase)
}

interface CacheStats {
  hits: number
  calls: number
}

/** Volání modelu s cache surových odpovědí. Klíč je celý dotaz, model a PIPELINE_VERSION. */
function cachedGenerateJson(config: LlmConfig, useCache: boolean, stats: CacheStats) {
  const generateJson = createGenerateJson(config)
  const defaultModel = config.provider === 'claude' ? config.anthropicModel : config.geminiModel
  return async (request: ModelRequest): Promise<unknown> => {
    const key = createHash('sha256')
      .update(
        JSON.stringify([PIPELINE_VERSION, config.provider, request.model ?? defaultModel, request]),
      )
      .digest('hex')
    const path = join(CACHE_DIR, `${key}.json`)
    if (useCache && existsSync(path)) {
      stats.hits++
      return (readJson(path) as { answer: unknown }).answer
    }
    const answer = await generateJson(request)
    stats.calls++
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(path, JSON.stringify({ answer }, null, 2) + '\n')
    return answer
  }
}

/**
 * Rozpis pro hledané období, jak by ho viděl plánovač. U rozvrhu s lichými a sudými týdny
 * se použije odpověď z meta.json, jako by ji dal člověk.
 */
function scheduleForPeriod(item: ScheduleCase, source: SourceContent): PersonSchedule {
  const answer = item.meta.weekParity
  const parity =
    answer && !source.parity.calendar
      ? withAnchor(source.parity, answer.date, answer.odd)
      : source.parity
  const period = { from: item.meta.from, to: item.meta.to }
  const composed = composeSchedule(
    { sources: [{ ...source, parity, id: item.id, files: [] }], overrides: [] },
    period,
  )!
  return {
    ...composed,
    shifts: composed.shifts.filter((shift) => period.from <= shift.date && shift.date <= period.to),
  }
}

async function readSchedule(
  item: ScheduleCase,
  config: LlmConfig,
  useCache: boolean,
): Promise<ReadResult> {
  const stats: CacheStats = { hits: 0, calls: 0 }
  try {
    const mimeType = MIME_BY_EXTENSION[item.fileName.split('.').pop() ?? ''] ?? ''
    // Stejná příprava jako v prohlížeči.
    const file = new File([new Uint8Array(item.bytes)], item.fileName, { type: mimeType })
    const { source, report } = await extractWithReport(
      { sources: [await prepareSource(file, item.kind)], from: item.meta.from, to: item.meta.to },
      { ...depsFromConfig(config), generateJson: cachedGenerateJson(config, useCache, stats) },
    )
    return {
      source,
      schedule: scheduleForPeriod(item, source),
      report,
      error: null,
      cached: stats.calls === 0,
    }
  } catch (error) {
    return {
      source: null,
      schedule: null,
      report: null,
      error: error instanceof Error ? error.message : String(error),
      cached: stats.calls === 0 && stats.hits > 0,
    }
  }
}

function scenarioHit(
  scenario: ScenarioCase,
  scheduleFor: (scheduleId: string) => PersonSchedule | null,
  truthFor: (scheduleId: string) => PersonSchedule | null,
): { hit: boolean; proposalDates: string[]; falseAvailable: string[] } {
  const participants = scenario.people.map((person) => ({
    id: person.id,
    schedule: scheduleFor(person.scheduleId),
  }))
  const proposals = findProposals(scenario.action, participants)
  // „Může“ v návrhu, ačkoli podle správných směn nemůže. Tohle se nesmí stát nikdy.
  const falseAvailable = proposals.flatMap((proposal) =>
    scenario.people
      .filter((person) => proposal.available.includes(person.id))
      .filter((person) => attendanceInSlot(truthFor(person.scheduleId), proposal) !== 'available')
      .map((person) => `${scenario.id}: ${person.name} ${proposal.date} ${proposal.start}`),
  )
  return {
    hit: isTopProposalHit(scenario.expectedDate, proposals),
    proposalDates: proposals.map((proposal) => `${proposal.date} ${proposal.start}`),
    falseAvailable,
  }
}

interface StabilityCheck {
  /** Případy: skupina, ve které jednomu nebo dvěma lidem schováme rozpis. */
  cases: number
  certain: number
  /** Případy s verdiktem „jistý“, kde po odkrytí rozpisů vyšel jiný den. Musí být 0. */
  violations: string[]
  /** U verdiktu „může se změnit“: kolik dvojic člověk–den analýza jmenovala ze schovaných. */
  namedPairs: number
  /** Kolik dvojic člověk–den v období akce bylo schovaných. */
  hiddenPairs: number
  /** Jmenovaní, kteří schovaní nebyli (ráno prvního dne, kdy chybí předchozí den). */
  namedOthers: number
}

interface UncertaintyCheck {
  /** Dny s nejistým čtením ve skupinách z přečtených rozpisů. */
  uncertainDays: number
  /** Z nich ty, na kterých stojí nejlepší termín. */
  pivotal: number
}

/**
 * Jistý, nebo křehký termín na skupinách se schovanými rozpisy. Kdykoli analýza řekne „jistý“,
 * musí po odkrytí vyjít stejný den jako se všemi daty.
 */
function hiddenScheduleCheck(
  scenarios: ScenarioCase[],
  truthFor: (scheduleId: string) => PersonSchedule | null,
): StabilityCheck {
  const check: StabilityCheck = {
    cases: 0,
    certain: 0,
    violations: [],
    namedPairs: 0,
    hiddenPairs: 0,
    namedOthers: 0,
  }
  for (const scenario of scenarios) {
    const participants = scenario.people.map((person) => ({
      id: person.id,
      schedule: truthFor(person.scheduleId),
    }))
    const [truth] = findProposals(scenario.action, participants)
    if (!truth) continue
    const ids = participants.map((participant) => participant.id)
    const hiddenSets = [
      ...ids.map((id) => [id]),
      ...ids.flatMap((id, index) => ids.slice(index + 1).map((other) => [id, other])),
    ]
    for (const hidden of hiddenSets) {
      const visible = participants.map((participant) =>
        hidden.includes(participant.id) ? { ...participant, schedule: null } : participant,
      )
      const result = analyzeStability(scenario.action, visible)
      if (!result.winner) continue
      check.cases++
      if (result.certain) {
        check.certain++
        if (result.winner.date !== truth.date) {
          check.violations.push(
            `${scenario.id} bez ${hidden.join(', ')}: jistý ${result.winner.date}, správně ${truth.date}`,
          )
        }
      } else {
        const days = eachDay(scenario.action.from, scenario.action.to).length
        check.hiddenPairs += hidden.length * days
        for (const pivot of result.pivots) {
          if (hidden.includes(pivot.personId)) check.namedPairs += pivot.dates.length
          else check.namedOthers += pivot.dates.length
        }
      }
    }
  }
  return check
}

/** Kolik nejistých čtení ve skupinách může změnit nejlepší termín (z přečtených rozpisů). */
function uncertaintyCheck(
  scenarios: ScenarioCase[],
  scheduleFor: (scheduleId: string) => PersonSchedule | null,
): UncertaintyCheck {
  const check = { uncertainDays: 0, pivotal: 0 }
  for (const scenario of scenarios) {
    const people = scenario.people.map((person) => ({
      id: person.id,
      name: person.name,
      schedule: scheduleFor(person.scheduleId),
    }))
    const stability = analyzeStability(scenario.action, people)
    for (const day of findUncertainDays(scenario.action, people)) {
      check.uncertainDays++
      const pivot = stability.pivots.find((item) => item.personId === day.personId)
      const pivotal = pivot?.dates.some(
        (item) =>
          item.reason === 'uncertain' &&
          (item.date === day.date || item.date === addDays(day.date, 1)),
      )
      if (pivotal) check.pivotal++
    }
  }
  return check
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)} %`
}

function formatShiftList(shifts: { date: string; start: string; end: string }[]): string {
  return shifts.map((shift) => `${shift.date} ${shift.start}–${shift.end}`).join(', ')
}

interface ScheduleOutcome {
  item: ScheduleCase
  counts: ShiftCounts | null
  diff: ShiftDiff | null
  result: ReadResult
}

function buildReport(
  date: string,
  model: string,
  outcomes: ScheduleOutcome[],
  scenarios: {
    scenario: ScenarioCase
    expectedHit: boolean
    readHit: boolean | null
    proposalDates: string[]
    falseAvailable: string[]
  }[],
  stability: StabilityCheck,
  uncertainty: UncertaintyCheck | null,
  readingEnabled: boolean,
): { markdown: string; summary: Record<string, unknown> } {
  const lines: string[] = [`# Měření ${date}`, '']
  const summary: Record<string, unknown> = { date, model: readingEnabled ? model : null }

  if (readingEnabled) {
    const scored = outcomes.filter((outcome) => outcome.counts)
    const total: ReadingScore = aggregate(scored.map((outcome) => outcome.counts!))
    summary.reading = total
    lines.push(
      `Model: \`${model}\``,
      '',
      '## Čtení rozpisů',
      '',
      `Celkem: recall **${percent(total.recall)}** (cíl ≥ ${RECALL_GOAL * 100} %), precision **${percent(total.precision)}**, správně ${total.correct} z ${total.expected} očekávaných směn, vráceno ${total.returned}.`,
      `Nepřečteno kvůli chybě: ${outcomes.length - scored.length} z ${outcomes.length} rozpisů.`,
      '',
      '### Podle formátu',
      '',
      '| Formát | Rozpisů | Recall | Precision |',
      '| --- | ---: | ---: | ---: |',
    )
    const byFormat = new Map<string, ScheduleOutcome[]>()
    for (const outcome of scored) {
      byFormat.set(outcome.item.meta.format, [
        ...(byFormat.get(outcome.item.meta.format) ?? []),
        outcome,
      ])
    }
    const formatScores: Record<string, ReadingScore> = {}
    for (const [format, group] of byFormat) {
      const score = aggregate(group.map((outcome) => outcome.counts!))
      formatScores[format] = score
      lines.push(
        `| ${format} | ${group.length} | ${percent(score.recall)} | ${percent(score.precision)} |`,
      )
    }
    summary.byFormat = formatScores

    lines.push(
      '',
      '### Podle rozpisu',
      '',
      '| Rozpis | Formát | Značení | Správně | Očekáváno | Vráceno | Poznámka |',
      '| --- | --- | --- | ---: | ---: | ---: | --- |',
    )
    for (const { item, counts, result } of outcomes) {
      const note = result.error
        ? `chyba: ${result.error.replace(/\|/g, '/').slice(0, 120)}`
        : result.cached
          ? 'z cache'
          : ''
      lines.push(
        `| ${item.id} | ${item.meta.format} | ${item.meta.notation} | ${counts?.correct ?? '–'} | ${counts?.expected ?? item.expected.shifts.length} | ${counts?.returned ?? '–'} | ${note} |`,
      )
    }

    const mistakes = outcomes.filter(
      (outcome) => outcome.diff && (outcome.diff.missing.length || outcome.diff.extra.length),
    )
    lines.push('', '### Chyby', '')
    if (mistakes.length === 0) lines.push('Žádné.')
    for (const { item, diff, result } of mistakes) {
      lines.push(`- **${item.id}** (${item.meta.format}, ${item.meta.style}):`)
      if (diff!.missing.length) lines.push(`  - chybí: ${formatShiftList(diff!.missing)}`)
      if (diff!.extra.length) lines.push(`  - navíc: ${formatShiftList(diff!.extra)}`)
      if (result.schedule?.warnings.length)
        lines.push(`  - varování modelu: ${result.schedule.warnings.join(' / ')}`)
    }

    const reported = outcomes.filter((outcome) => outcome.result.report)
    const withKinds = reported.filter((outcome) => outcome.item.meta.kinds)
    const recognized = withKinds.filter((outcome) =>
      outcome.item.meta.kinds!.includes(outcome.result.report!.documentKind),
    )
    const secondLooks = reported.filter((outcome) => outcome.result.report!.readings === 2)
    const disagreements = reported.reduce(
      (sum, outcome) => sum + outcome.result.report!.disagreements,
      0,
    )
    const returned = scored.flatMap((outcome) => outcome.result.schedule!.shifts)
    const flagged = returned.filter((shift) => shift.uncertain).length
    const wrong = scored.flatMap((outcome) => outcome.diff!.extra)
    const silentlyWrong = wrong.filter((shift) => !shift.uncertain).length
    summary.phases = {
      recognition: { correct: recognized.length, total: withKinds.length },
      secondLook: { ran: secondLooks.length, total: reported.length, disagreements },
      checks: { returned: returned.length, flagged, wrong: wrong.length, silentlyWrong },
    }
    lines.push(
      '',
      '### Po fázích',
      '',
      `- Rozpoznání typu podkladu: **${recognized.length} z ${withKinds.length}** správně.`,
      `- Druhé čtení: spuštěno u ${secondLooks.length} z ${reported.length} rozpisů, neshod mezi čteními: ${disagreements}.`,
      `- Kontroly: jako nejisté označeno ${flagged} z ${returned.length} vrácených směn.`,
      `- Chybně vrácených směn: ${wrong.length}, z toho **${silentlyWrong} bez označení nejistoty** (tiché chyby).`,
    )
    const misrecognized = withKinds.filter((outcome) => !recognized.includes(outcome))
    for (const { item, result } of misrecognized) {
      lines.push(
        `  - ${item.id}: rozpoznáno jako \`${result.report!.documentKind}\`, čekalo se ${item.meta.kinds!.join(' nebo ')}`,
      )
    }
  }

  if (scenarios.length > 0) {
    const expectedHits = scenarios.filter((entry) => entry.expectedHit).length
    const readHits = scenarios.filter((entry) => entry.readHit).length
    const falseAvailable = scenarios.flatMap((entry) => entry.falseAvailable)
    const hitGoal = Math.ceil(HIT_GOAL * scenarios.length)
    summary.scenarios = {
      total: scenarios.length,
      expectedHits,
      readHits: readingEnabled ? readHits : null,
      falseAvailable: readingEnabled ? falseAvailable.length : null,
    }
    lines.push(
      '',
      '## Skupiny a termín',
      '',
      `Se správnými směnami: **${expectedHits} z ${scenarios.length}** (kontrola scheduleru: očekávaný termín je nejlepší návrh, takže má vyjít vždy).`,
    )
    if (readingEnabled) {
      lines.push(
        `S přečtenými rozpisy: **${readHits} z ${scenarios.length}** (cíl ≥ ${hitGoal}).`,
        `Falešné „může“ v návrzích z přečtených rozpisů: **${falseAvailable.length}** (cíl 0).`,
      )
      for (const item of falseAvailable) lines.push(`- ${item}`)
    }
    lines.push(
      '',
      '| Skupina | Lidí | Očekávaný termín | Návrhy z přečtených rozpisů | Trefa |',
      '| --- | ---: | --- | --- | --- |',
    )
    for (const entry of scenarios) {
      const hit = entry.readHit === null ? 'n/a' : entry.readHit ? 'ano' : 'ne'
      lines.push(
        `| ${entry.scenario.id} | ${entry.scenario.people.length} | ${entry.scenario.expectedDate} | ${entry.proposalDates.join('; ') || '–'} | ${hit} |`,
      )
    }

    summary.stability = {
      cases: stability.cases,
      certain: stability.certain,
      violations: stability.violations.length,
      namedPairs: stability.namedPairs,
      hiddenPairs: stability.hiddenPairs,
      namedOthers: stability.namedOthers,
      uncertainty,
    }
    lines.push(
      '',
      '## Jistý, nebo křehký termín',
      '',
      'Ve skupinách se schovají rozpisy jednomu nebo dvěma lidem a porovná se verdikt s tím, co vyjde se všemi daty.',
      '',
      `- Verdikt „jistý“: ${stability.certain} z ${stability.cases} případů.`,
      `- Jistý, ale po odkrytí jiný den: **${stability.violations.length}** (cíl 0).`,
    )
    for (const violation of stability.violations) lines.push(`  - ${violation}`)
    if (stability.hiddenPairs > 0) {
      lines.push(
        `- U verdiktu „může se změnit“ analýza ze ${stability.hiddenPairs} schovaných dvojic člověk–den jmenovala ${stability.namedPairs} (${percent(stability.namedPairs / stability.hiddenPairs)}), ostatní není potřeba shánět. Navíc jmenovala ${stability.namedOthers} dvojic lidí, kteří schovaní nebyli: ráno prvního dne, kdy rozpis nepokrývá předchozí den.`,
      )
    }
    if (uncertainty) {
      lines.push(
        `- Nejistá čtení ve skupinách z přečtených rozpisů: ${uncertainty.uncertainDays}, z toho může změnit nejlepší termín ${uncertainty.pivotal}.`,
      )
    }
  }
  return { markdown: lines.join('\n') + '\n', summary }
}

async function main() {
  const args = process.argv.slice(2)
  const expectedOnly = args.includes('--expected-only')
  const useCache = !args.includes('--no-cache')
  const onlyIndex = args.indexOf('--only')
  const only = onlyIndex === -1 ? null : args[onlyIndex + 1].split(',')

  const allSchedules = loadSchedules()
  const schedules = only
    ? allSchedules.filter((item) => only.some((prefix) => item.id.startsWith(prefix)))
    : allSchedules
  const scenarios = only ? [] : loadScenarios()
  // Klíče k modelu jsou v .env bez předpony VITE_, aby se nedostaly do aplikace pro prohlížeč.
  if (existsSync('.env')) process.loadEnvFile('.env')
  const { config, legacyNames } = llmConfigFromEnv(process.env)
  if (legacyNames.length > 0) {
    console.warn(`Přejmenuj v .env: ${legacyNames.join(', ')} (bez předpony VITE_).`)
  }
  const model = modelName(config)

  const missing = missingSettings(config)
  if (!expectedOnly && missing.length > 0) {
    console.error(
      `Chybí ${missing.join(' a ')} v .env. Pro měření bez modelu použij --expected-only.`,
    )
    process.exit(1)
  }

  const outcomes: ScheduleOutcome[] = []
  if (!expectedOnly) {
    for (const item of schedules) {
      const result = await readSchedule(item, config, useCache)
      const counts = result.schedule
        ? compareShifts(item.expected.shifts, result.schedule.shifts)
        : null
      const diff = result.schedule ? diffShifts(item.expected.shifts, result.schedule.shifts) : null
      outcomes.push({ item, counts, diff, result })
      const label = result.error
        ? `chyba: ${result.error}`
        : `${counts!.correct}/${counts!.expected} správně${result.cached ? ' (cache)' : ''}`
      console.log(`${item.id}: ${label}`)
    }
  }

  const expectedById = new Map(allSchedules.map((item) => [item.id, item.expected]))
  const readById = new Map(outcomes.map((outcome) => [outcome.item.id, outcome.result.schedule]))
  const truthFor = (id: string) => expectedById.get(id) ?? null
  const scenarioResults = scenarios.map((scenario) => {
    const expectedHit = scenarioHit(scenario, truthFor, truthFor).hit
    const read = expectedOnly
      ? null
      : scenarioHit(scenario, (id) => readById.get(id) ?? null, truthFor)
    return {
      scenario,
      expectedHit,
      readHit: read?.hit ?? null,
      proposalDates: read?.proposalDates ?? [],
      falseAvailable: read?.falseAvailable ?? [],
    }
  })
  const stability = hiddenScheduleCheck(scenarios, truthFor)
  const uncertainty = expectedOnly
    ? null
    : uncertaintyCheck(scenarios, (id) => readById.get(id) ?? null)

  const date = new Date().toISOString().slice(0, 10)
  const { markdown, summary } = buildReport(
    date,
    model,
    outcomes,
    scenarioResults,
    stability,
    uncertainty,
    !expectedOnly,
  )
  mkdirSync(RESULTS_DIR, { recursive: true })
  const suffix = expectedOnly ? '-expected' : ''
  writeFileSync(join(RESULTS_DIR, `${date}${suffix}.md`), markdown)
  writeFileSync(
    join(RESULTS_DIR, `${date}${suffix}.json`),
    JSON.stringify(
      {
        summary,
        outcomes: outcomes.map(({ item, counts, diff, result }) => ({
          id: item.id,
          counts,
          diff,
          schedule: result.schedule,
          error: result.error,
        })),
        scenarios: scenarioResults,
      },
      null,
      2,
    ) + '\n',
  )

  console.log('')
  console.log(markdown.split('\n').slice(0, 12).join('\n'))
  console.log(`Výsledky: eval/results/${date}${suffix}.md`)
}

await main()
