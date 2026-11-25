import { z } from 'zod'
import {
  DateStringSchema,
  SCHOOL_CIRCLE,
  WORK_CIRCLE,
  type DateString,
  type SourceContent,
} from '@/core/schema'
import { reconcile } from './checks'
import type { LlmConfig } from './config'
import { expandReading } from './expand'
import type { ModelPart, PreparedSource } from './ingest'
import { createGenerateJson, type GenerateJson } from './model'
import { ReadingSchema, readingJsonSchema, type Reading } from './reading'
import { buildSource, type ReviewBasis } from './review'
import { systemInstruction } from './skill'

/**
 * Čtení rozpisu ve čtyřech fázích (podrobně v docs/PIPELINE.md):
 * 1. rozpoznání podkladu, 2. strukturální čtení (model), 3. převod na data (kód),
 * 4. kontroly a při nejistotě druhé, nezávislé čtení.
 */

/**
 * Podklady připravené pro model (ingest.ts, v prohlížeči nebo v měření). Jméno člověka ani názvy
 * souborů se modelu neposílají, v podkladech se nehledá. Všechny podklady patří jednomu člověku.
 */
export interface ExtractInput {
  sources: PreparedSource[]
  from: DateString
  to: DateString
}

export interface ExtractDeps {
  generateJson: GenerateJson
  systemInstruction: string
  /** Druhé čtení při nejistotě. Zdvojnásobí cenu jen u podkladů, kde si model nebyl jistý. */
  verify: 'auto' | 'never'
  /** Jiný model pro druhé čtení, jinak se použije stejný. */
  verifyModel?: string
}

/** Co se o podkladu zjistilo cestou. Slouží měření po fázích. */
export interface ExtractReport {
  documentKind: Reading['documentKind']
  readability: Reading['readability']
  people: Reading['people']
  readings: 1 | 2
  disagreements: number
}

export interface ExtractResult {
  /** Přečtený zdroj: celý podklad, neořezaný na hledané období. */
  source: SourceContent
  report: ExtractReport
  /** Co server uloží, aby šel zdroj po odpovědích na doptání přepočítat (review.ts). */
  basis: ReviewBasis
}

/** Podklad nejde přečíst (rozmazaná fotka, prázdný soubor). Uživatel má vložit jiný. */
export class UnreadableSourceError extends Error {
  override name = 'UnreadableSourceError'
  /** Co se z podkladu modelu neposlalo. Může to být důvod, proč v něm není co číst. */
  readonly notes: string[]

  constructor(message: string, notes: string[] = []) {
    super(message)
    this.notes = notes
  }
}

const MANY_PEOPLE_WARNING =
  'Podklad obsahuje rozpisy více lidí. Každý člověk má mít vlastní podklad.'
const PARTIAL_WARNING = 'Podklad je čitelný jen zčásti, zkontroluj přečtené směny.'
const SECOND_LOOK_FAILED_WARNING = 'Druhé čtení se nepodařilo, nejisté směny zkontroluj ručně.'

const SECOND_LOOK_INSTRUCTION =
  'Toto je druhé, nezávislé čtení téhož podkladu. Postupuj pomalu po jednotlivých dnech ' +
  'a každý údaj ověř proti záhlaví a legendě.'

/** Závislosti podle nastavení. Měření si z nich nahradí volání modelu verzí s cache. */
export function depsFromConfig(config: LlmConfig): ExtractDeps {
  return {
    generateJson: createGenerateJson(config),
    systemInstruction,
    verify: config.verify,
    verifyModel: config.verifyModel,
  }
}

function contextText(input: ExtractInput): string {
  return [
    `Hledané období: ${input.from} až ${input.to} (rok ${input.from.slice(0, 4)}).`,
    'Všechny podklady patří jedné osobě. Popiš její obsazenost podle zadaného JSON schématu.',
  ].join('\n')
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(kořen)'}: ${issue.message}`)
    .join('\n')
}

/** Fáze 2: jedno strukturální čtení. Při neplatné odpovědi se model zeptá ještě jednou. */
async function readOnce(
  deps: ExtractDeps,
  baseParts: ModelPart[],
  model?: string,
): Promise<Reading> {
  let parts = baseParts
  let lastIssues = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await deps.generateJson({
      systemInstruction: deps.systemInstruction,
      parts,
      jsonSchema: readingJsonSchema,
      ...(model ? { model } : {}),
    })
    const parsed = ReadingSchema.safeParse(answer)
    if (parsed.success) return parsed.data
    lastIssues = describeIssues(parsed.error)
    parts = [
      ...baseParts,
      {
        text: `Tvoje předchozí odpověď byla neplatná:\n${lastIssues}\nOprav ji a vrať celý JSON znovu.`,
      },
    ]
  }
  throw new Error(`Model vrátil neplatné čtení: ${lastIssues}`)
}

/** Fáze 1: co s podkladem podle toho, jak ho model rozpoznal. */
function triage(reading: Reading, sourceNotes: string[]): Reading {
  if (reading.readability === 'unreadable') {
    throw new UnreadableSourceError('Podklad je nečitelný.', sourceNotes)
  }
  if (reading.people === 'many') {
    // Bez jména nejde poznat, čí řádek je správný, proto se nevrátí nic.
    return {
      ...reading,
      coverage: [],
      dated: [],
      weekly: [],
      warnings: [...new Set([...reading.warnings, MANY_PEOPLE_WARNING])],
    }
  }
  if (reading.readability === 'partial') {
    return { ...reading, warnings: [...reading.warnings, PARTIAL_WARNING] }
  }
  return reading
}

function needsSecondLook(reading: Reading): boolean {
  if (reading.people === 'many') return false
  return (
    reading.readability === 'partial' ||
    reading.people === 'unclear' ||
    reading.dated.some((entry) => entry.uncertain) ||
    reading.weekly.some((entry) => entry.uncertain)
  )
}

/** Přečte rozpis jedné osoby z jejích podkladů a vrátí i to, co se o podkladu zjistilo. */
export async function extractWithReport(
  input: ExtractInput,
  deps: ExtractDeps,
): Promise<ExtractResult> {
  DateStringSchema.parse(input.from)
  DateStringSchema.parse(input.to)

  const { sources } = input
  if (sources.length === 0) throw new Error('Chybí podklad ke čtení.')
  const parts: ModelPart[] = [
    ...sources.flatMap(({ part }, index): ModelPart[] => [
      // Jen číslo podkladu, aby model mohl u každého údaje říct, odkud je.
      // Název souboru se neposílá, bývá v něm jméno.
      { text: `Podklad ${index + 1}:` },
      part,
    ]),
    { text: contextText(input) },
  ]
  // Co se z podkladů modelu neposlalo, má uživatel vidět mezi poznámkami ke čtení.
  // Dva soubory se stejným názvem dají stejnou poznámku, stačí jednou.
  const sourceNotes = [...new Set(sources.flatMap(({ notes }) => notes))]

  const first = triage(await readOnce(deps, parts), sourceNotes)
  const readings: Reading[] = [first]
  const extraWarnings: string[] = []
  const report: ExtractReport = {
    documentKind: first.documentKind,
    readability: first.readability,
    people: first.people,
    readings: 1,
    disagreements: 0,
  }

  if (deps.verify === 'auto' && needsSecondLook(first)) {
    try {
      const secondParts = [...parts, { text: SECOND_LOOK_INSTRUCTION }]
      const second = triage(await readOnce(deps, secondParts, deps.verifyModel), sourceNotes)
      report.disagreements = reconcile(
        expandReading(first, input.from, input.to),
        expandReading(second, input.from, input.to),
      ).disagreements
      readings.push(second)
      report.readings = 2
    } catch {
      extraWarnings.push(SECOND_LOOK_FAILED_WARNING)
    }
  }

  // Převod na data, porovnání čtení a kontroly dělá stejný kód jako přepočet po doptání.
  const basis: ReviewBasis = {
    readings,
    period: { from: input.from, to: input.to },
    extraWarnings,
    notes: sourceNotes,
  }
  const built = buildSource(basis, [])
  return {
    source: {
      coverage: built.coverage,
      shifts: built.shifts,
      warnings: built.warnings,
      questions: built.questions,
      // Výchozí okruh podle typu podkladu, uživatel ho může změnit.
      circle: defaultCircle(first),
      parity: { calendar: first.weekParity === 'calendar', anchors: [] },
    },
    report,
    basis,
  }
}

/**
 * Škola, když je většina bloků výuka (model ji značí „ŠK“). Týdenní vzor sám o sobě školu
 * neznamená: pravidelné směny „každé pondělí ranní“ jsou práce.
 */
export function defaultCircle(reading: Reading): string {
  const blocks = [...reading.dated, ...reading.weekly]
  const school = blocks.filter((block) => block.label.trim().toUpperCase() === 'ŠK').length
  return school > 0 && school * 2 >= blocks.length ? SCHOOL_CIRCLE : WORK_CIRCLE
}

export async function extractSchedule(
  input: ExtractInput,
  deps: ExtractDeps,
): Promise<SourceContent> {
  return (await extractWithReport(input, deps)).source
}
