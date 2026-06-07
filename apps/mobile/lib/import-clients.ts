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
