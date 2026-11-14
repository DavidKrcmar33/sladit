import type { SourceFileKind } from './schema'

const KIND_BY_EXTENSION: Record<string, SourceFileKind> = {
  xlsx: 'xlsx',
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  heic: 'image',
  heif: 'image',
  txt: 'text',
  csv: 'text',
}

const KIND_BY_MIME_TYPE: Record<string, SourceFileKind> = {
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'image/heic': 'image',
  'image/heif': 'image',
  'text/plain': 'text',
  'text/csv': 'text',
}

export const ACCEPTED_FILE_TYPES = [
  ...Object.keys(KIND_BY_EXTENSION).map((extension) => `.${extension}`),
  ...Object.keys(KIND_BY_MIME_TYPE),
].join(',')

export function detectSourceFileKind(fileName: string, mimeType: string): SourceFileKind | null {
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : ''
  return KIND_BY_EXTENSION[extension] ?? KIND_BY_MIME_TYPE[mimeType] ?? null
}
