export type ImportField = 'full_name' | 'email' | 'phone' | 'subscription_start_date'

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  full_name: 'Nombre completo',
  email: 'Email',
  phone: 'Teléfono',
  subscription_start_date: 'Fecha de inicio',
}

const HEADER_SYNONYMS: Record<ImportField, readonly string[]> = {
  full_name: [
    'nombre',
    'nombre completo',
    'name',
    'full name',
    'fullname',
    'alumno',
    'cliente',
    'apellido y nombre',
    'nombre y apellido',
    'nombres',
    'nombre del alumno',
    'paciente',
  ],
  email: [
    'email',
    'correo',
    'e-mail',
    'mail',
    'correo electronico',
    'correo electrónico',
    'e mail',
    'direccion email',
    'dirección email',
  ],
  phone: [
    'telefono',
    'teléfono',
    'celular',
    'whatsapp',
    'phone',
    'movil',
    'móvil',
    'tel',
    'fono',
    'numero',
    'número',
    'numero de contacto',
    'contacto',
  ],
  subscription_start_date: [
    'fecha inicio',
    'inicio',
    'start date',
    'fecha alta',
    'desde',
    'fecha de inicio',
    'comienzo',
    'fecha registro',
    'fecha de alta',
    'alta',
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

// Iterative Levenshtein distance — O(n*m) time, O(min(n,m)) space.
// Adequate for header strings (max ~30 chars).
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

export type HeaderMatch = {
  field: ImportField | null
  confidence: HeaderConfidence
  similarity: number
}

const FUZZY_THRESHOLD = 0.8

const NORMALIZED_SYNONYMS = Object.fromEntries(
  (Object.entries(HEADER_SYNONYMS) as [ImportField, readonly string[]][]).map(
    ([field, synonyms]) => [field, Array.from(new Set(synonyms.map(normalizeHeader)))],
  ),
) as unknown as Record<ImportField, readonly string[]>

export function matchHeader(rawHeader: string): HeaderMatch {
  const norm = normalizeHeader(rawHeader)
  if (norm.length === 0) {
    return { field: null, confidence: 'none', similarity: 0 }
  }

  for (const [field, synonyms] of Object.entries(NORMALIZED_SYNONYMS) as [
    ImportField,
    readonly string[],
  ][]) {
    if (synonyms.includes(norm)) {
      return { field, confidence: 'exact', similarity: 1 }
    }
  }

  let bestField: ImportField | null = null
  let bestSimilarity = 0

  for (const [field, synonyms] of Object.entries(NORMALIZED_SYNONYMS) as [
    ImportField,
    readonly string[],
  ][]) {
    for (const syn of synonyms) {
      const maxLen = Math.max(syn.length, norm.length)
      if (maxLen === 0) continue
      const d = levenshtein(norm, syn)
      const similarity = 1 - d / maxLen
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestField = field
      }
    }
  }

  if (bestSimilarity >= FUZZY_THRESHOLD) {
    return { field: bestField, confidence: 'fuzzy', similarity: bestSimilarity }
  }

  return { field: null, confidence: 'none', similarity: bestSimilarity }
}

export function matchHeaders(rawHeaders: readonly string[]): HeaderMatch[] {
  const matches = rawHeaders.map(matchHeader)

  // Conflict resolution: if two headers match the same field, keep the one
  // with highest confidence (exact > fuzzy similarity). The other is demoted
  // to none so the user resolves it manually.
  const fieldOwner = new Map<ImportField, number>()
  matches.forEach((match, index) => {
    if (!match.field) return
    const current = fieldOwner.get(match.field)
    if (current === undefined) {
      fieldOwner.set(match.field, index)
      return
    }
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
