// P3: parser CSV para importar alumnos (port 1:1 del importador web org/clients).
// Columnas: nombre,email,telefono. Maneja comillas y auto-skip de header.
export interface ParsedClientRow {
  name: string
  email: string
  phone: string
  valid: boolean
  error?: string
}

function splitCsvLine(line: string): string[] {
  const cols: string[] = []
  let cur = ''
  let inQuote = false
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue }
    if ((ch === ',' || ch === ';') && !inQuote) { cols.push(cur); cur = ''; continue }
    cur += ch
  }
  cols.push(cur)
  return cols
}

// ── Raw sheet parsing + mapeo de columnas arbitrarias ──────────────────────────
// El wizard (app/coach/clients-import.tsx) necesita las columnas crudas para que el coach
// mapee headers arbitrarios → campos EVA. Espejo del flujo web (Step2MapColumns + header-matcher),
// pero CSV-only en mobile (xlsx queda como follow-up — no agregamos SheetJS).

/** Campos EVA destino del mapeo (espejo de ImportField de la web). */
export type ImportField = 'full_name' | 'email' | 'phone' | 'subscription_start_date'

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  full_name: 'Nombre completo',
  email: 'Email',
  phone: 'Teléfono',
  subscription_start_date: 'Fecha de inicio',
}

export interface ParsedSheet {
  headers: string[]
  rows: string[][]
  filename: string
}

/** Parsea CSV crudo a {headers, rows} para el paso de mapeo. Asume primera línea = header. */
export function parseRawSheet(text: string, filename = 'pegado.csv'): ParsedSheet {
  const lines = text.replace(/﻿/g, '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim().length > 0)
  if (!lines.length) return { headers: [], rows: [], filename }
  const headers = splitCsvLine(lines[0]).map((h) => h.trim())
  const rows = lines.slice(1).map((l) => {
    const cols = splitCsvLine(l).map((c) => c.trim())
    // pad/truncar a la longitud del header para alinear el mapeo por índice
    while (cols.length < headers.length) cols.push('')
    return cols.slice(0, headers.length)
  })
  return { headers, rows, filename }
}

// Sinónimos de header (espejo de apps/web/src/lib/import/header-matcher.ts).
const HEADER_SYNONYMS: Record<ImportField, readonly string[]> = {
  full_name: ['nombre', 'nombre completo', 'name', 'full name', 'fullname', 'alumno', 'cliente', 'apellido y nombre', 'nombre y apellido', 'nombres', 'nombre del alumno', 'paciente'],
  email: ['email', 'correo', 'e-mail', 'mail', 'correo electronico', 'correo electrónico', 'e mail', 'direccion email', 'dirección email'],
  phone: ['telefono', 'teléfono', 'celular', 'whatsapp', 'phone', 'movil', 'móvil', 'tel', 'fono', 'numero', 'número', 'numero de contacto', 'contacto'],
  subscription_start_date: ['fecha inicio', 'inicio', 'start date', 'fecha alta', 'desde', 'fecha de inicio', 'comienzo', 'fecha registro', 'fecha de alta', 'alta'],
}

function normalizeHeader(value: string): string {
  if (typeof value !== 'string') return ''
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '')
}

function levenshtein(a: string, b: string): number {
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
  (Object.entries(HEADER_SYNONYMS) as [ImportField, readonly string[]][]).map(([f, syns]) => [f, Array.from(new Set(syns.map(normalizeHeader)))]),
) as unknown as Record<ImportField, readonly string[]>

function matchHeader(rawHeader: string): HeaderMatch {
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
      const similarity = 1 - levenshtein(norm, syn) / maxLen
      if (similarity > bestSimilarity) { bestSimilarity = similarity; bestField = field }
    }
  }
  if (bestSimilarity >= FUZZY_THRESHOLD) return { field: bestField, confidence: 'fuzzy', similarity: bestSimilarity }
  return { field: null, confidence: 'none', similarity: bestSimilarity }
}

/** Auto-detecta el mapeo de cada header. Resuelve conflictos (dos headers al mismo campo → gana el de mayor confianza). */
export function matchHeaders(rawHeaders: readonly string[]): HeaderMatch[] {
  const matches = rawHeaders.map(matchHeader)
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

/** Mapa columnIndex → campo EVA (o null = ignorar). */
export type ColumnMapping = Record<number, ImportField | null>

/** Normaliza una celda de fecha a ISO YYYY-MM-DD (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD). null si no parsea. */
export function normalizeImportDate(val: string | null | undefined): string | null {
  if (!val) return null
  const s = String(val).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  const dmyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, '0')}-${dmyDash[1].padStart(2, '0')}`
  return null
}

export interface MappedClientRow {
  rowIndex: number
  name: string
  email: string
  phone: string
  startDate: string | null
  valid: boolean
  error?: string
}

/**
 * Aplica el mapeo a las filas crudas → filas validadas (válida = nombre + email con @, sin duplicar).
 * full_name y email son obligatorios; si no están mapeados todas las filas serán inválidas.
 */
export function applyMapping(sheet: ParsedSheet, mapping: ColumnMapping): MappedClientRow[] {
  // índice de columna por campo (primer match)
  const colFor = (field: ImportField): number => {
    for (const [colIdx, f] of Object.entries(mapping)) if (f === field) return Number(colIdx)
    return -1
  }
  const nameCol = colFor('full_name')
  const emailCol = colFor('email')
  const phoneCol = colFor('phone')
  const dateCol = colFor('subscription_start_date')

  const seen = new Set<string>()
  return sheet.rows.map((row, rowIndex) => {
    const name = (nameCol >= 0 ? row[nameCol] ?? '' : '').trim()
    const email = (emailCol >= 0 ? row[emailCol] ?? '' : '').trim().toLowerCase()
    const phone = (phoneCol >= 0 ? row[phoneCol] ?? '' : '').trim()
    const startDate = dateCol >= 0 ? normalizeImportDate(row[dateCol]) : null
    let valid = true
    let error: string | undefined
    if (!name || name.length < 2) { valid = false; error = 'Falta nombre' }
    else if (!email || !email.includes('@')) { valid = false; error = 'Email inválido' }
    else if (seen.has(email)) { valid = false; error = 'Email duplicado' }
    if (valid) seen.add(email)
    return { rowIndex, name, email, phone, startDate, valid, error }
  })
}

/** Parsea texto CSV/pegado a filas validadas (válida = nombre + email con @, sin duplicar email). */
export function parseClientsCsv(text: string): ParsedClientRow[] {
  const lines = text.replace(/﻿/g, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines.length) return []
  // auto-skip header: la primera línea menciona nombre/name/email/correo y tiene separador.
  const start = (/nombre|name|email|correo|tel/i.test(lines[0]) && /[,;]/.test(lines[0])) ? 1 : 0
  const seen = new Set<string>()
  const rows: ParsedClientRow[] = []
  for (let i = start; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    const name = (cols[0] ?? '').trim()
    const email = (cols[1] ?? '').trim().toLowerCase()
    const phone = (cols[2] ?? '').trim()
    let valid = true
    let error: string | undefined
    if (!name) { valid = false; error = 'Falta nombre' }
    else if (!email || !email.includes('@')) { valid = false; error = 'Email inválido' }
    else if (seen.has(email)) { valid = false; error = 'Email duplicado' }
    if (valid) seen.add(email)
    rows.push({ name, email, phone, valid, error })
  }
  return rows
}
