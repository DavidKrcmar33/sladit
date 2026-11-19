import ExcelJS from 'exceljs'
// jszip je závislost exceljs. Tady jen upravuje XML listu pro zápisy, které ExcelJS sám nevytvoří.
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { prepareSource } from './ingest'

async function workbookFile(build: (workbook: ExcelJS.Workbook) => void): Promise<File> {
  const workbook = new ExcelJS.Workbook()
  build(workbook)
  const buffer = await workbook.xlsx.writeBuffer()
  return new File([buffer], 'rozpis.xlsx')
}

async function patchedWorkbookFile(
  build: (workbook: ExcelJS.Workbook) => void,
  patchSheet: (sheetXml: string) => string,
): Promise<File> {
  const workbook = new ExcelJS.Workbook()
  build(workbook)
  const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer())
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const sheetXml = await zip.file(sheetPath)!.async('string')
  const patched = patchSheet(sheetXml)
  if (patched === sheetXml) throw new Error('Úprava XML se neprovedla.')
  zip.file(sheetPath, patched)
  return new File([await zip.generateAsync({ type: 'arraybuffer' })], 'rozpis.xlsx')
}

const HIDDEN_NOTE_END = 'Nečtou se, počítá se jen s tím, co je v Excelu vidět.'

describe('prepareSource', () => {
  it('passes text through with a label', async () => {
    const file = new File(['Po R\nÚt O'], 'poznamka.txt', { type: 'text/plain' })
    expect(await prepareSource(file, 'text')).toEqual({
      part: { text: 'Podklad (text):\nPo R\nÚt O' },
      notes: [],
    })
  })

  it('encodes images as base64 with their MIME type', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 250])], 'foto.png', { type: 'image/png' })
    expect(await prepareSource(file, 'image')).toEqual({
      part: { inlineData: { mimeType: 'image/png', data: 'AQID+g==' } },
      notes: [],
    })
  })

  it('fills in the MIME type when the browser does not know it', async () => {
    const heic = new File([new Uint8Array([1])], 'IMG_1.HEIC')
    const pdf = new File([new Uint8Array([1])], 'rozpis.pdf')
    expect(await prepareSource(heic, 'image')).toMatchObject({
      part: { inlineData: { mimeType: 'image/heic' } },
    })
    expect(await prepareSource(pdf, 'pdf')).toMatchObject({
      part: { inlineData: { mimeType: 'application/pdf' } },
    })
  })

  it('encodes large files without overflowing the call stack', async () => {
    const file = new File([new Uint8Array(1_000_000).fill(255)], 'velky.pdf')
    const { part } = await prepareSource(file, 'pdf')
    expect('inlineData' in part && part.inlineData.data.length).toBe(1_333_336)
  })

  it('turns every sheet of a workbook into cell lines with fill colors', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Listopad')
      sheet.getCell('A1').value = 'Jméno'
      sheet.getCell('B1').value = 'Po 23.'
      sheet.getCell('A2').value = 'Petr N.'
      sheet.getCell('B2').value = 'N'
      sheet.getCell('B2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' },
      }
      sheet.getCell('C2').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF00' },
      }
      workbook.addWorksheet('Legenda').getCell('A1').value = 'N = noční 22–6'
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: {
        text: [
          'Podklad (Excel), list „Listopad“:',
          'A1: Jméno',
          'B1: Po 23.',
          'A2: Petr N.',
          'B2: N [výplň #1F4E79]',
          'C2: [výplň #FFFF00]',
          '',
          'Podklad (Excel), list „Legenda“:',
          'A1: N = noční 22–6',
        ].join('\n'),
      },
      notes: [],
    })
  })

  it('reads formula results and ignores empty cells', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('List1')
      sheet.getCell('A1').value = { formula: '1+1', result: 2 }
      sheet.getCell('A3').value = 'konec'
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „List1“:\nA1: 2\nA3: konec' },
      notes: [],
    })
  })

  it('describes a merged cell once, at its corner', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Rozpis')
      sheet.mergeCells('A1:C1')
      sheet.getCell('A1').value = 'Listopad 2026'
      sheet.getCell('A2').value = 'Po 23.'
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „Rozpis“:\nA1: Listopad 2026\nA2: Po 23.' },
      notes: [],
    })
  })

  it('reports a file that is not a valid workbook', async () => {
    const file = new File(['not a zip'], 'rozbity.xlsx')
    await expect(prepareSource(file, 'xlsx')).rejects.toThrow(/Excel/)
  })
})

describe('hidden parts of a workbook', () => {
  it('leaves out hidden sheets and says so', async () => {
    const file = await workbookFile((workbook) => {
      workbook.addWorksheet('Rozpis').getCell('A1').value = 'Po R'
      const hidden = workbook.addWorksheet('Mzdy')
      hidden.state = 'hidden'
      hidden.getCell('A1').value = 'tajná mzda'
      const veryHidden = workbook.addWorksheet('Kontakty')
      veryHidden.state = 'veryHidden'
      veryHidden.getCell('A1').value = 'tajný telefon'
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „Rozpis“:\nA1: Po R' },
      notes: [`V souboru rozpis.xlsx jsou skryté listy. ${HIDDEN_NOTE_END}`],
    })
  })

  it('leaves out hidden rows and columns and says so', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Tým')
      sheet.addRow(['Jméno', 'Telefon', 'Po 23.'])
      sheet.addRow(['Petr N.', 'tajný telefon', 'R'])
      sheet.addRow(['Jana K.', 'tajný telefon', 'N'])
      sheet.getColumn(2).hidden = true
      sheet.getRow(3).hidden = true
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: {
        text: [
          'Podklad (Excel), list „Tým“:',
          'A1: Jméno',
          'C1: Po 23.',
          'A2: Petr N.',
          'C2: R',
        ].join('\n'),
      },
      notes: [`V souboru rozpis.xlsx jsou skryté řádky a sloupce. ${HIDDEN_NOTE_END}`],
    })
  })

  it('leaves out a hidden cell that only has a fill color', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Rozpis')
      sheet.getCell('A1').value = 'Po 23.'
      sheet.getCell('B1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' },
      }
      sheet.getColumn(2).hidden = true
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „Rozpis“:\nA1: Po 23.' },
      notes: [`V souboru rozpis.xlsx jsou skryté sloupce. ${HIDDEN_NOTE_END}`],
    })
  })

  it('says nothing about hidden rows and columns that are empty', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Rozpis')
      sheet.getCell('A1').value = 'Po R'
      sheet.getColumn(3).hidden = true
      sheet.getRow(5).hidden = true
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „Rozpis“:\nA1: Po R' },
      notes: [],
    })
  })

  it('shows a merged cell at its first visible address when its corner is hidden', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Rozpis')
      sheet.mergeCells('A1:C1')
      sheet.getCell('A1').value = 'Listopad 2026'
      sheet.getCell('B2').value = 'Po 23.'
      sheet.getColumn(1).hidden = true
    })

    // Nic se nevynechalo, nadpis je vidět přes sloupce B a C, proto bez poznámky.
    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „Rozpis“:\nB1: Listopad 2026\nB2: Po 23.' },
      notes: [],
    })
  })

  it('still mentions a hidden column that holds more than a merged corner', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Rozpis')
      sheet.mergeCells('A1:C1')
      sheet.getCell('A1').value = 'Listopad 2026'
      sheet.getCell('A2').value = 'tajné jméno'
      sheet.getCell('B2').value = 'Po 23.'
      sheet.getColumn(1).hidden = true
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „Rozpis“:\nB1: Listopad 2026\nB2: Po 23.' },
      notes: [`V souboru rozpis.xlsx jsou skryté sloupce. ${HIDDEN_NOTE_END}`],
    })
  })

  it('does not move a merged cell away from a visible corner', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Rozpis')
      // Roh A1 má jen barvu a jeho řádek je jinak prázdný, takže se nečte. Tak to bylo i dřív.
      sheet.mergeCells('A1:A3')
      sheet.getCell('A1').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E79' },
      }
      sheet.getCell('B2').value = 'Po R'
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „Rozpis“:\nB2: Po R' },
      notes: [],
    })
  })

  it('says nothing about a hidden sheet that is empty', async () => {
    const file = await workbookFile((workbook) => {
      workbook.addWorksheet('Rozpis').getCell('A1').value = 'Po R'
      workbook.addWorksheet('Prázdný').state = 'hidden'
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel), list „Rozpis“:\nA1: Po R' },
      notes: [],
    })
  })

  it('understands hidden flags written as true and false, the way LibreOffice writes them', async () => {
    const file = await patchedWorkbookFile(
      (workbook) => {
        const sheet = workbook.addWorksheet('Tým')
        sheet.addRow(['Jméno', 'Po 23.'])
        sheet.addRow(['Petr N.', 'R'])
        sheet.addRow(['Jana K.', 'N'])
      },
      (sheetXml) =>
        sheetXml
          .replace('<row r="1"', '<row hidden="false" r="1"')
          .replace('<row r="2"', '<row hidden="false" r="2"')
          .replace('<row r="3"', '<row hidden="true" r="3"'),
    )

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: {
        text: [
          'Podklad (Excel), list „Tým“:',
          'A1: Jméno',
          'B1: Po 23.',
          'A2: Petr N.',
          'B2: R',
        ].join('\n'),
      },
      notes: [`V souboru rozpis.xlsx jsou skryté řádky. ${HIDDEN_NOTE_END}`],
    })
  })

  it('leaves out a column of zero width even without the hidden flag', async () => {
    const file = await patchedWorkbookFile(
      (workbook) => {
        const sheet = workbook.addWorksheet('Tým')
        sheet.addRow(['Jméno', 'Telefon', 'Po 23.'])
        sheet.addRow(['Petr N.', 'tajný telefon', 'R'])
      },
      (sheetXml) =>
        sheetXml.replace(
          '<sheetData>',
          '<cols><col min="2" max="2" width="0" customWidth="1"/></cols><sheetData>',
        ),
    )

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: {
        text: [
          'Podklad (Excel), list „Tým“:',
          'A1: Jméno',
          'C1: Po 23.',
          'A2: Petr N.',
          'C2: R',
        ].join('\n'),
      },
      notes: [`V souboru rozpis.xlsx jsou skryté sloupce. ${HIDDEN_NOTE_END}`],
    })
  })

  it('does not send an empty request when no sheet is visible', async () => {
    const file = await workbookFile((workbook) => {
      const sheet = workbook.addWorksheet('Rozpis')
      sheet.state = 'hidden'
      sheet.getCell('A1').value = 'Po R'
    })

    expect(await prepareSource(file, 'xlsx')).toEqual({
      part: { text: 'Podklad (Excel): žádný viditelný list.' },
      notes: [`V souboru rozpis.xlsx jsou skryté listy. ${HIDDEN_NOTE_END}`],
    })
  })
})
