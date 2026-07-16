import { describe, expect, it } from 'vitest'
import {
  ATTENTION_FILTER_OPTIONS,
  applyRosterFilters,
  encodeCursorStack,
  filterPickerEntries,
  isRosterPageComplete,
  mapHubMetrics,
  normalizeText,
  parseCursorStack,
  parseRosterFilters,
  planCtaLabel,
  serializeRosterFilters,
  type RosterFilters,
  type RosterItemLike,
} from './hub-roster'

function item(overrides: Partial<RosterItemLike> & { clientId: string }): RosterItemLike {
  return {
    clientName: 'Sin nombre',
    planId: null,
    attentionReason: 'none',
    lastIntakeAt: null,
    pendingDrafts: 0,
    ...overrides,
  }
}

const filters = (overrides: Partial<RosterFilters> = {}): RosterFilters => ({
  search: '',
  attention: 'all',
  sort: 'default',
  ...overrides,
})

describe('normalizeText', () => {
  it('lower-cases and strips accents', () => {
    expect(normalizeText('  José MUÑOZ  ')).toBe('jose munoz')
  })
})

describe('applyRosterFilters — attention', () => {
  const items = [
    item({ clientId: 'a', attentionReason: 'no_plan' }),
    item({ clientId: 'b', attentionReason: 'none' }),
    item({ clientId: 'c', attentionReason: 'draft_pending' }),
  ]

  it('all keeps everything', () => {
    expect(applyRosterFilters(items, filters()).map((i) => i.clientId)).toEqual(['a', 'b', 'c'])
  })

  it('needs_attention drops the "none" rows', () => {
    expect(
      applyRosterFilters(items, filters({ attention: 'needs_attention' })).map((i) => i.clientId),
    ).toEqual(['a', 'c'])
  })

  it('specific reason filters to that reason', () => {
    expect(
      applyRosterFilters(items, filters({ attention: 'no_plan' })).map((i) => i.clientId),
    ).toEqual(['a'])
  })
})

describe('applyRosterFilters — search', () => {
  const items = [
    item({ clientId: 'a', clientName: 'José Pérez' }),
    item({ clientId: 'b', clientName: 'Maria Lopez' }),
  ]

  it('matches accent-insensitively on name', () => {
    expect(applyRosterFilters(items, filters({ search: 'jose' })).map((i) => i.clientId)).toEqual([
      'a',
    ])
  })

  it('empty search returns all', () => {
    expect(applyRosterFilters(items, filters({ search: '   ' })).length).toBe(2)
  })
})

describe('applyRosterFilters — sort', () => {
  it('default preserves server order', () => {
    const items = [
      item({ clientId: 'z', clientName: 'Zoe' }),
      item({ clientId: 'a', clientName: 'Ana' }),
    ]
    expect(applyRosterFilters(items, filters({ sort: 'default' })).map((i) => i.clientId)).toEqual([
      'z',
      'a',
    ])
  })

  it('name sorts A-Z accent-insensitively', () => {
    const items = [
      item({ clientId: 'z', clientName: 'Zoe' }),
      item({ clientId: 'a', clientName: 'Ána' }),
    ]
    expect(applyRosterFilters(items, filters({ sort: 'name' })).map((i) => i.clientId)).toEqual([
      'a',
      'z',
    ])
  })

  it('activity puts most-recent first and nulls last', () => {
    const items = [
      item({ clientId: 'never', lastIntakeAt: null }),
      item({ clientId: 'old', lastIntakeAt: '2026-07-01T10:00:00Z' }),
      item({ clientId: 'new', lastIntakeAt: '2026-07-14T10:00:00Z' }),
    ]
    expect(applyRosterFilters(items, filters({ sort: 'activity' })).map((i) => i.clientId)).toEqual([
      'new',
      'old',
      'never',
    ])
  })

  it('attention ranks by priority (no_plan first)', () => {
    const items = [
      item({ clientId: 'none', attentionReason: 'none' }),
      item({ clientId: 'draft', attentionReason: 'draft_pending' }),
      item({ clientId: 'noplan', attentionReason: 'no_plan' }),
      item({ clientId: 'stale', attentionReason: 'no_recent_intake' }),
    ]
    expect(
      applyRosterFilters(items, filters({ sort: 'attention' })).map((i) => i.clientId),
    ).toEqual(['noplan', 'draft', 'stale', 'none'])
  })

  it('sort is stable on ties', () => {
    const items = [
      item({ clientId: 'first', attentionReason: 'none' }),
      item({ clientId: 'second', attentionReason: 'none' }),
    ]
    expect(
      applyRosterFilters(items, filters({ sort: 'attention' })).map((i) => i.clientId),
    ).toEqual(['first', 'second'])
  })
})

describe('parseRosterFilters', () => {
  it('reads valid params', () => {
    expect(parseRosterFilters({ q: 'ana', attn: 'no_plan', sort: 'name' })).toEqual({
      search: 'ana',
      attention: 'no_plan',
      sort: 'name',
    })
  })

  it('falls back to defaults on invalid values', () => {
    expect(parseRosterFilters({ attn: 'bogus', sort: 'nope' })).toEqual({
      search: '',
      attention: 'all',
      sort: 'default',
    })
  })

  it('takes the first value of an array param', () => {
    expect(parseRosterFilters({ q: ['ana', 'ignored'] }).search).toBe('ana')
  })
})

describe('serializeRosterFilters', () => {
  it('omits defaults', () => {
    expect(serializeRosterFilters({ search: '', attention: 'all', sort: 'default' })).toEqual({})
  })

  it('emits only non-default params, trimmed', () => {
    expect(
      serializeRosterFilters({ search: '  ana ', attention: 'no_plan', sort: 'name' }),
    ).toEqual({ q: 'ana', attn: 'no_plan', sort: 'name' })
  })

  it('round-trips through parse', () => {
    const original: RosterFilters = { search: 'jose', attention: 'draft_pending', sort: 'activity' }
    expect(parseRosterFilters(serializeRosterFilters(original))).toEqual(original)
  })
})

describe('mapHubMetrics', () => {
  const opts = { todayLocalDate: '2026-07-14', timeZone: 'America/Santiago' }

  it('counts plan / no-plan and today activity', () => {
    const items = [
      // 2026-07-14T02:00:00Z -> 2026-07-13 23:00 in Santiago (UTC-4 en invierno austral -> -04): still 13th
      item({ clientId: 'a', planId: 'p1', lastIntakeAt: '2026-07-14T18:00:00Z' }), // 14:00 local -> today
      item({ clientId: 'b', planId: null, lastIntakeAt: null }),
      item({ clientId: 'c', planId: 'p2', lastIntakeAt: '2026-07-10T18:00:00Z' }), // not today
    ]
    expect(mapHubMetrics(items, opts)).toEqual({
      total: 3,
      withPlan: 2,
      withoutPlan: 1,
      activeToday: 1,
    })
  })

  it('handles an empty page', () => {
    expect(mapHubMetrics([], opts)).toEqual({
      total: 0,
      withPlan: 0,
      withoutPlan: 0,
      activeToday: 0,
    })
  })

  it('ignores unparseable timestamps for activeToday', () => {
    const items = [item({ clientId: 'x', planId: 'p', lastIntakeAt: 'not-a-date' })]
    expect(mapHubMetrics(items, opts).activeToday).toBe(0)
  })
})

describe('planCtaLabel', () => {
  it('ofrece "Nueva versión" solo cuando hay plan publicado', () => {
    expect(planCtaLabel('published')).toBe('Nueva versión')
  })

  it('cae a "Crear plan" sin plan o con borrador (no publicado)', () => {
    expect(planCtaLabel(null)).toBe('Crear plan')
    expect(planCtaLabel('draft')).toBe('Crear plan')
    expect(planCtaLabel('superseded')).toBe('Crear plan')
  })
})

describe('isRosterPageComplete (metricas totales vs resumen de pagina)', () => {
  it('es total solo sin cursor de entrada y sin pagina siguiente', () => {
    expect(isRosterPageComplete({ hasMore: false, hasIncomingCursor: false })).toBe(true)
  })

  it('con pagina siguiente -> resumen de pagina', () => {
    expect(isRosterPageComplete({ hasMore: true, hasIncomingCursor: false })).toBe(false)
  })

  it('con cursor de entrada (pagina interna) -> resumen de pagina', () => {
    expect(isRosterPageComplete({ hasMore: false, hasIncomingCursor: true })).toBe(false)
  })
})

describe('cursor stack (paginacion anterior/siguiente)', () => {
  it('round-trip preserva cursores y el centinela null', () => {
    const stack = [
      null,
      { updatedAt: '2026-07-14T18:00:00.000Z', clientId: '11111111-1111-4111-8111-111111111111' },
    ]
    expect(parseCursorStack(encodeCursorStack(stack))).toEqual(stack)
  })

  it('distingue pila vacia de una pila con un solo null', () => {
    expect(encodeCursorStack([])).toBe('')
    expect(parseCursorStack('')).toEqual([])
    expect(parseCursorStack(null)).toEqual([])
    // [null] NO debe colapsar a [] (por eso el centinela '_')
    expect(parseCursorStack(encodeCursorStack([null]))).toEqual([null])
  })

  it('tolera entradas corruptas devolviendolas como null', () => {
    expect(parseCursorStack('sinseparador')).toEqual([null])
  })
})


describe("filterPickerEntries", () => {
  const roster = [
    { clientId: "c1", clientName: "Ana Perez" },
    { clientId: "c2", clientName: "Benja Nuñez" },
    { clientId: "c3", clientName: "Camila Rios" },
  ]

  it("devuelve una copia intacta cuando la query esta vacia", () => {
    const out = filterPickerEntries(roster, "")
    expect(out).toHaveLength(3)
    expect(out).not.toBe(roster)
  })

  it("filtra por nombre ignorando mayusculas", () => {
    expect(filterPickerEntries(roster, "ana").map((e) => e.clientId)).toEqual(["c1"])
  })

  it("es tolerante a acentos en ambos sentidos", () => {
    expect(filterPickerEntries(roster, "nunez").map((e) => e.clientId)).toEqual(["c2"])
    expect(filterPickerEntries(roster, "PÉREZ").map((e) => e.clientId)).toEqual(["c1"])
  })

  it("devuelve vacio sin coincidencias", () => {
    expect(filterPickerEntries(roster, "zzz")).toEqual([])
  })
})

describe("ATTENTION_FILTER_OPTIONS", () => {
  it("no expone jerga interna (sufijo V2) en las etiquetas visibles", () => {
    for (const option of ATTENTION_FILTER_OPTIONS) {
      expect(option.label).not.toMatch(/V2/)
    }
  })
})
