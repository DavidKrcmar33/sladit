import ExcelJS from 'exceljs'
import type { SourceFileKind } from '@/core/schema'

/** Část požadavku pro model: text, nebo soubor v base64. */
export type ModelPart = { text: string } | { inlineData: { mimeType: string; data: string } }

/** Podklad připravený pro model a poznámky pro uživatele o tom, co se z něj neposlalo. */
export interface PreparedSource {
  part: ModelPart
  notes: string[]
}

/** Co ze sešitu modelu nejde, protože to v Excelu není vidět. */
interface HiddenContent {
  sheets: boolean
  rows: boolean
  columns: boolean
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
}

function mimeTypeOf(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream'
}

function toBase64(bytes: Uint8Array): string {
  // Po kouscích, jinak by velký soubor přetekl zásobník při String.fromCharCode(...).
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function inlineData(file: File): Promise<ModelPart> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return { inlineData: { mimeType: mimeTypeOf(file), data: toBase64(bytes) } }
}

function fillDescription(cell: ExcelJS.Cell): string {
  const fill = cell.fill
  if (fill?.type !== 'pattern' || fill.pattern !== 'solid') return ''
  const argb = fill.fgColor?.argb
  if (argb) return `[výplň #${argb.slice(-6).toUpperCase()}]`
  if (fill.fgColor?.theme !== undefined) return `[výplň motiv ${fill.fgColor.theme}]`
  return ''
}

function isColumnHidden(column: ExcelJS.Column): boolean {
  // Sloupec s nulovou šířkou v Excelu vidět není, i když příznak skrytí nemá.
  return column.hidden || column.width === 0
}

function isCellHidden(sheet: ExcelJS.Worksheet, cell: ExcelJS.Cell): boolean {
  return sheet.getRow(Number(cell.row)).hidden || isColumnHidden(sheet.getColumn(Number(cell.col)))
}

function hasOwnContent(cell: ExcelJS.Cell): boolean {
  const isCovered = cell.isMerged && cell.master.address !== cell.address
  return !isCovered && Boolean(cell.text || fillDescription(cell))
}

/** Řádky listu pro model. Skryté řádky a sloupce vynechá a zapíše, že v nich něco bylo. */
function sheetLines(sheet: ExcelJS.Worksheet, hidden: HiddenContent): string[] {
  const lines: string[] = []
  // Skryté buňky s obsahem. Sloučená buňka se skrytým rohem se ukáže jinde a odsud se vyřadí.
  const skipped = new Map<string, 'rows' | 'columns'>()
  const movedMerges = new Set<string>()

  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (row.hidden || isColumnHidden(sheet.getColumn(Number(cell.col)))) {
        if (hasOwnContent(cell)) skipped.set(cell.address, row.hidden ? 'rows' : 'columns')
        return
      }
      // Sloučená buňka má hodnotu jen v levém horním rohu a tam se také popíše.
      // Když je roh skrytý, popíše se jednou, na první viditelné adrese.
      const corner = cell.master
      if (corner.address !== cell.address) {
        if (!isCellHidden(sheet, corner) || movedMerges.has(corner.address)) return
        movedMerges.add(corner.address)
        skipped.delete(corner.address)
      }
      const fill = fillDescription(corner)
      if (!corner.text && !fill) return
      lines.push(`${cell.address}: ${`${corner.text} ${fill}`.trim()}`)
    })
  })

  for (const kind of skipped.values()) hidden[kind] = true
  return lines
}

function hiddenNote(fileName: string, hidden: HiddenContent): string | null {
  const kinds = [
    hidden.sheets ? 'listy' : '',
    hidden.rows ? 'řádky' : '',
    hidden.columns ? 'sloupce' : '',
  ].filter(Boolean)
  if (kinds.length === 0) return null
  const last = kinds[kinds.length - 1]
  const list = kinds.length > 1 ? `${kinds.slice(0, -1).join(', ')} a ${last}` : last
  return `V souboru ${fileName} jsou skryté ${list}. Nečtou se, počítá se jen s tím, co je v Excelu vidět.`
}

/**
 * Sešit jako text s adresami a barvami buněk. Modelu jde jen to, co je v Excelu vidět:
 * skryté listy, řádky a sloupce bývají cizí nebo pomocná data, o kterých uživatel neví.
 */
async function readWorkbook(file: File): Promise<PreparedSource> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(await file.arrayBuffer())
  } catch {
    throw new Error(`Soubor ${file.name} se nepodařilo otevřít jako Excel.`)
  }

  const hidden: HiddenContent = { sheets: false, rows: false, columns: false }
  const sheets: string[] = []
  workbook.eachSheet((sheet) => {
    if (sheet.state !== 'visible') {
      // Poznámka jen tehdy, když by list jako viditelný modelu něco poslal.
      const inside: HiddenContent = { sheets: false, rows: false, columns: false }
      const hasContent = sheetLines(sheet, inside).length > 0 || inside.rows || inside.columns
      if (hasContent) hidden.sheets = true
      return
    }
    const lines = [`Podklad (Excel), list „${sheet.name}“:`, ...sheetLines(sheet, hidden)]
    sheets.push(lines.join('\n'))
  })

  const note = hiddenNote(file.name, hidden)
  return {
    part: { text: sheets.join('\n\n') || 'Podklad (Excel): žádný viditelný list.' },
    notes: note ? [note] : [],
  }
}

/**
 * Převede podklad na část požadavku. Obrázky a PDF jdou modelu přímo, text beze změny,
 * z Excelu jen viditelná část jako text s barvami buněk.
 */
export async function prepareSource(file: File, kind: SourceFileKind): Promise<PreparedSource> {
  switch (kind) {
    case 'image':
    case 'pdf':
      return { part: await inlineData(file), notes: [] }
    case 'text':
      return { part: { text: `Podklad (text):\n${await file.text()}` }, notes: [] }
    case 'xlsx':
      return readWorkbook(file)
  }
}
