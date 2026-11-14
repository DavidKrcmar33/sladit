import { describe, expect, it } from 'vitest'
import { detectSourceFileKind } from './sourceFile'

describe('detectSourceFileKind', () => {
  it.each([
    ['rozpis.xlsx', '', 'xlsx'],
    ['IMG_2041.JPG', 'image/jpeg', 'image'],
    ['screenshot.png', 'image/png', 'image'],
    ['photo.heic', '', 'image'],
    ['Směny 48. týden.pdf', 'application/pdf', 'pdf'],
    ['zprava.txt', 'text/plain', 'text'],
    ['export.csv', 'text/csv', 'text'],
  ] as const)('recognises %s (%s) as %s', (fileName, mimeType, expected) => {
    expect(detectSourceFileKind(fileName, mimeType)).toBe(expected)
  })

  it('falls back to the MIME type when the name has no extension', () => {
    expect(detectSourceFileKind('image', 'image/webp')).toBe('image')
  })

  it.each([
    ['rozpis.docx', ''],
    ['video.mp4', 'video/mp4'],
    ['stary.xls', 'application/vnd.ms-excel'],
  ])('rejects %s', (fileName, mimeType) => {
    expect(detectSourceFileKind(fileName, mimeType)).toBeNull()
  })
})
