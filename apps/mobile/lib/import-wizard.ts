// Import wizard — lógica pura del importador multi-paso de alumnos (espejo del
// web `/coach/clients/import`). Port 1:1 de `apps/web/src/lib/import/header-matcher.ts`
// + `csv-injection.ts` + el `normalizeImportDate`/validación de los steps 2/3.
//
// NOTA (drift): esta lógica está duplicada del web (no vive en un `packages/*`).
// Candidato a extraer a un paquete compartido (`@eva/import-matching`) para matar
// el drift — igual que `profile-analytics`. Mientras tanto, cualquier fix de las
// fórmulas de matcheo/validación en web debe replicarse aquí.
import { z } from 'zod'

// ─── Campos EVA ────────────────────────────────────────────────────────────────

export type ImportField = 'full_name' | 'email' | 'phone' | 'subscription_start_date'

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  full_name: 'Nombre completo',
  email: 'Email',
  phone: 'Teléfono',
  subscription_start_date: 'Fecha de inicio',
}

export const REQUIRED_FIELDS: ImportField[] = ['full_name', 'email']

const HEADER_SYNONYMS: Record<ImportField, readonly string[]> = {
  full_name: [
    'nombre', 'nombre completo', 'name', 'full name', 'fullname', 'alumno',
    'cliente', 'apellido y nombre', 'nombre y apellido', 'nombres',
    'nombre del alumno', 'paciente',
  ],
  email: [
    'email', 'correo', 'e-mail', 'mail', 'correo electronico', 'correo electrónico',
    'e mail', 'direccion email', 'dirección email',
  ],
  phone: [
    'telefono', 'teléfono', 'celular', 'whatsapp', 'phone', 'movil', 'móvil',
    'tel', 'fono', 'numero', 'número', 'numero de contacto', 'contacto',
  ],
  subscription_start_date: [
    'fecha inicio', 'inicio', 'start date', 'fecha alta', 'desde', 'fecha de inicio',
    'comienzo', 'fecha registro', 'fecha de alta', 'alta',
  ],
}

export function normalizeHeader(value: string): string {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '')
}

// Levenshtein iterativo — O(n*m) tiempo, O(min(n,m)) espacio.
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

export type HeaderConfidence = 'exact' | 'fuzzy' | 'none'
export type HeaderMatch = { field: ImportField | null; confidence: HeaderConfidence; similarity: number }

const FUZZY_THRESHOLD = 0.8

const NORMALIZED_SYNONYMS = Object.fromEntries(
  (Object.entries(HEADER_SYNONYMS) as [ImportField, readonly string[]][]).map(
    ([field, synonyms]) => [field, Array.from(new Set(synonyms.map(normalizeHeader)))],
  ),
) as unknown as Record<ImportField, readonly string[]>

export function matchHeader(rawHeader: string): HeaderMatch {
  const norm = normalizeHeader(rawHeader)
  if (norm.length === 0) return { field: null, confidence: 'none', similarity: 0 }

  for (const [field, synonyms] of Object.entries(NORMALIZED_SYNONYMS) as [ImportField, readonly string[]][]) {
    if (synonyms.includes(norm)) return { field, confidence: 'exact', similarity: 1 }
  }

  let bestField: ImportField | null = null
  let bestSimilarity = 0
  for (const [field, synonyms] of Object.entries(NORMALIZED_SYNONYMS) as [ImportField, readonly string[]][]) {
    for (const syn of synonyms) {
      const maxLen = Math.max(syn.length, norm.length)
      if (maxLen === 0) continue
      const d = levenshtein(norm, syn)
      const similarity = 1 - d / maxLen
      if (similarity > bestSimilarity) { bestSimilarity = similarity; bestField = field }
    }
  }

  if (bestSimilarity >= FUZZY_THRESHOLD) return { field: bestField, confidence: 'fuzzy', similarity: bestSimilarity }
  return { field: null, confidence: 'none', similarity: bestSimilarity }
}

export function matchHeaders(rawHeaders: readonly string[]): HeaderMatch[] {
  const matches = rawHeaders.map(matchHeader)
  // Resolución de conflictos: si dos headers matchean el mismo campo, gana el de
  // mayor confianza; el otro cae a 'none' para que el coach lo resuelva a mano.
  const fieldOwner = new Map<ImportField, number>()
  matches.forEach((match, index) => {
    if (!match.field) return
    const current = fieldOwner.get(match.field)
    if (current === undefined) { fieldOwner.set(match.field, index); return }
    const incumbent = matches[current]
    const incumbentScore = incumbent.confidence === 'exact' ? 2 : incumbent.similarity
    const challengerScore = match.confidence === 'exact' ? 2 : match.similarity
    if (challengerScore > incumbentScore) {
      matches[current] = { field: null, confidence: 'none', similarity: incumbent.similarity }
      fieldOwner.set(match.field, index)
    } else {
      matches[index] = { field: null, confidence: 'none', similarity: match.similarity }
    }
  })
  return matches
}

// ─── CSV injection guard (espejo web csv-injection.ts) ──────────────────────────

const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

export function isDangerousCell(input: unknown): boolean {
  if (typeof input !== 'string' || input.length === 0) return false
  return DANGEROUS_PREFIXES.includes(input[0])
}

// ─── Normalización de fecha (espejo Step2MapColumns.normalizeImportDate, rama string) ──

/** Normaliza a ISO YYYY-MM-DD. Acepta DD/MM/AAAA, DD-MM-AAAA, YYYY-MM-DD. null si no parsea. */
export function normalizeImportDate(val: unknown): string | null {
  if (val == null) return null
  const s = String(val).trim()
  if (!s) return null
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, '0')}-${dmyDash[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

// ─── Parser CSV → hoja (headers + filas) ────────────────────────────────────────

export type ParsedSheet = { headers: string[]; rows: string[][]; filename: string }
export type ColumnMapping = Record<number, ImportField | null>

function splitCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue }
    if ((ch === ',' || ch === ';') && !inQuote) { cols.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  cols.push(cur.trim())
  return cols
}

export const MAX_IMPORT_ROWS = 1000

/**
 * Parsea texto CSV/pegado a una hoja con headers + filas de datos. A diferencia
 * de `parseClientsCsv` (columnas fijas), la primera línea SIEMPRE se toma como
 * encabezados para permitir el mapeo de columnas del wizard.
 */
export function parseCsvToSheet(text: string, filename = 'import.csv'): ParsedSheet {
  const lines = text.replace(/﻿/g, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return { headers: lines[0] ? splitCsvLine(lines[0]) : [], rows: [], filename }
  const headers = splitCsvLine(lines[0])
  const rows = lines.slice(1, 1 + MAX_IMPORT_ROWS).map((l) => {
    const cols = splitCsvLine(l)
    // pad para alinear con headers
    while (cols.length < headers.length) cols.push('')
    return cols
  })
  return { headers, rows, filename }
}

// ─── Filas mapeadas + validación (espejo Step2/Step3) ──────────────────────────

export type MappedRow = {
  full_name: string | null
  email: string | null
  phone?: string | null
  subscription_start_date?: string | null
  _rowIndex: number
}

export function buildMappedRows(sheet: ParsedSheet, mapping: ColumnMapping): MappedRow[] {
  return sheet.rows.map((row, rowIdx) => {
    const mapped: MappedRow = { _rowIndex: rowIdx, full_name: null, email: null }
    Object.entries(mapping).forEach(([colIdx, field]) => {
      if (!field) return
      const raw = row[Number(colIdx)]
      const val = field === 'subscription_start_date'
        ? normalizeImportDate(raw)
        : raw != null && String(raw).trim() !== '' ? String(raw).trim() : null
      ;(mapped as Record<string, unknown>)[field] = val
    })
    return mapped
  })
}

const rowSchema = z.object({
  full_name: z.string().min(2, 'Nombre muy corto').max(100),
  email: z.string().email('Email inválido'),
  phone: z.string().optional().nullable(),
  subscription_start_date: z.string().optional().nullable(),
})

export type RowStatus = 'valid' | 'error' | 'warning'
export type AnnotatedRow = MappedRow & {
  _status: RowStatus
  _errors: string[]
  _warnings: string[]
  _isDuplicate: boolean
}

/** Anota cada fila con estado/errores/advertencias (1:1 con web Step3Preview). */
export function annotateRows(mappedRows: MappedRow[]): AnnotatedRow[] {
  const seenEmails = new Set<string>()
  return mappedRows.map((row) => {
    const errors: string[] = []
    const warnings: string[] = []
    const emailKey = row.email?.toLowerCase().trim()

    const parsed = rowSchema.safeParse(row)
    if (!parsed.success) {
      errors.push(...Object.values(parsed.error.flatten().fieldErrors).flat().filter(Boolean) as string[])
    }

    if (emailKey && seenEmails.has(emailKey)) warnings.push('Email duplicado en este archivo (se omitirá)')
    if (emailKey) seenEmails.add(emailKey)

    if (isDangerousCell(row.full_name) || isDangerousCell(row.email)) {
      warnings.push('Celda con carácter especial — se sanitizará automáticamente')
    }

    const status: RowStatus = errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid'
    return { ...row, _status: status, _errors: errors, _warnings: warnings, _isDuplicate: warnings.some((w) => w.includes('duplicado')) }
  })
}

/** Filas que efectivamente se importan: sin error y sin duplicado en el archivo. */
export function importableRows(annotated: AnnotatedRow[]): MappedRow[] {
  return annotated
    .filter((r) => r._status !== 'error' && !r._isDuplicate)
    .map(({ _status, _errors, _warnings, _isDuplicate, ...row }) => row)
}
