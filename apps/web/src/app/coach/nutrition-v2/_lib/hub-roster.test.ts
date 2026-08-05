import { describe, expect, it } from 'vitest'
import {
  ATTENTION_FILTER_OPTIONS,
  DEFAULT_SORT,
  applyRosterFilters,
  attentionReasonLabel,
  buildContactList,
  daysSinceLastEntry,
  encodeCursorStack,
  filterPickerEntries,
  isRosterPageComplete,
  isoDaysBetween,
  isoShiftDays,
  mapHubMetrics,
  normalizePhoneDigits,
  normalizeText,
  parseCursorScore,
  parseCursorStack,
  parseRosterFilters,
  pickWeeklyDrops,
  planCtaLabel,
  serializeRosterFilters,
  serverSortFor,
  weeklyDropMessage,
  whatsappHref,
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
  sort: DEFAULT_SORT,
  ...overrides,
})

const ctx = { todayIso: '2026-08-05', timeZone: 'America/Santiago' }

describe('normalizeText', () => {
  it('lower-cases and strips accents', () => {
    expect(normalizeText('  José MUÑOZ  ')).toBe('jose munoz')
  })
})

it('does not expose the legacy no-plan filter as a chip', () => {
  expect(ATTENTION_FILTER_OPTIONS.some((option) => (option.value as string) === 'no_plan')).toBe(
    false,
  )
})

it('acepta no_plan como valor de URL (lo activa la tile "Sin plan")', () => {
  expect(parseRosterFilters({ attn: 'no_plan' }).attention).toBe('no_plan')
})

describe('applyRosterFilters — attention', () => {
  const items = [
    item({ clientId: 'a', attentionReason: 'no_plan' }),
    item({ clientId: 'b', attentionReason: 'none' }),
    item({ clientId: 'c', attentionReason: 'draft_pending' }),
  ]

  it('all keeps everything', () => {
    expect(applyRosterFilters(items, filters(), ctx).map((i) => i.clientId)).toEqual(['a', 'b', 'c'])
  })

  it('needs_attention drops the "none" rows', () => {
    expect(
      applyRosterFilters(items, filters({ attention: 'needs_attention' }), ctx).map(
        (i) => i.clientId,
      ),
    ).toEqual(['a', 'c'])
  })

  it('on_track deja SOLO los "none"', () => {
    expect(
      applyRosterFilters(items, filters({ attention: 'on_track' }), ctx).map((i) => i.clientId),
    ).toEqual(['b'])
  })

  it('specific reason filters to that reason', () => {
    expect(
      applyRosterFilters(items, filters({ attention: 'draft_pending' }), ctx).map((i) => i.clientId),
    ).toEqual(['c'])
  })

  it('no_plan filtra por esa razon (tile de stats)', () => {
    expect(
      applyRosterFilters(items, filters({ attention: 'no_plan' }), ctx).map((i) => i.clientId),
    ).toEqual(['a'])
  })
})

describe('applyRosterFilters — stale_3d', () => {
  const items = [
    item({
      clientId: 'ayer',
      days7d: [{ date: '2026-08-04', entryCount: 2, consumedCalories: 1800, targetCalories: 2000 }],
    }),
    item({
      clientId: 'hace3',
      days7d: [{ date: '2026-08-02', entryCount: 1, consumedCalories: 900, targetCalories: null }],
    }),
    item({ clientId: 'nunca' }),
  ]

  it('deja los de 3+ dias sin registrar y a los que nunca registraron', () => {
    expect(
      applyRosterFilters(items, filters({ attention: 'stale_3d' }), ctx).map((i) => i.clientId),
    ).toEqual(['hace3', 'nunca'])
  })

  it('sin contexto de fecha no inventa: no deja pasar a nadie', () => {
    expect(applyRosterFilters(items, filters({ attention: 'stale_3d' }))).toEqual([])
  })
})

describe('applyRosterFilters — la busqueda ya NO filtra client-side', () => {
  it('el server aplico p_search: el helper no vuelve a filtrar por nombre', () => {
    const items = [
      item({ clientId: 'a', clientName: 'José Pérez' }),
      item({ clientId: 'b', clientName: 'Maria Lopez' }),
    ]
    expect(applyRosterFilters(items, filters({ search: 'jose' }), ctx).map((i) => i.clientId)).toEqual(
      ['a', 'b'],
    )
  })
})

describe('applyRosterFilters — sort', () => {
  it('attention y recientes preservan el orden del servidor', () => {
    const items = [
      item({ clientId: 'z', clientName: 'Zoe' }),
      item({ clientId: 'a', clientName: 'Ana' }),
    ]
    expect(
      applyRosterFilters(items, filters({ sort: 'attention' }), ctx).map((i) => i.clientId),
    ).toEqual(['z', 'a'])
    expect(
      applyRosterFilters(items, filters({ sort: 'recientes' }), ctx).map((i) => i.clientId),
    ).toEqual(['z', 'a'])
  })

  it('name sorts A-Z accent-insensitively', () => {
    const items = [
      item({ clientId: 'z', clientName: 'Zoe' }),
      item({ clientId: 'a', clientName: 'Ána' }),
    ]
    expect(applyRosterFilters(items, filters({ sort: 'name' }), ctx).map((i) => i.clientId)).toEqual(
      ['a', 'z'],
    )
  })

  it('activity puts most-recent first and nulls last', () => {
    const items = [
      item({ clientId: 'never', lastIntakeAt: null }),
      item({ clientId: 'old', lastIntakeAt: '2026-07-01T10:00:00Z' }),
      item({ clientId: 'new', lastIntakeAt: '2026-07-14T10:00:00Z' }),
    ]
    expect(
      applyRosterFilters(items, filters({ sort: 'activity' }), ctx).map((i) => i.clientId),
    ).toEqual(['new', 'old', 'never'])
  })

  it('sort is stable on ties', () => {
    const items = [
      item({ clientId: 'first', clientName: 'Ana' }),
      item({ clientId: 'second', clientName: 'Ana' }),
    ]
    expect(applyRosterFilters(items, filters({ sort: 'name' }), ctx).map((i) => i.clientId)).toEqual(
      ['first', 'second'],
    )
  })
})

describe('serverSortFor', () => {
  it('solo "attention" viaja como attention; el resto lee la pagina reciente', () => {
    expect(serverSortFor('attention')).toBe('attention')
    expect(serverSortFor('recientes')).toBe('default')
    expect(serverSortFor('name')).toBe('default')
    expect(serverSortFor('activity')).toBe('default')
  })
})

describe('parseRosterFilters', () => {
  it('reads valid params', () => {
    expect(parseRosterFilters({ q: 'ana', attn: 'draft_pending', sort: 'name' })).toEqual({
      search: 'ana',
      attention: 'draft_pending',
      sort: 'name',
    })
  })

  it('el default de orden es el triage (attention)', () => {
    expect(parseRosterFilters({}).sort).toBe('attention')
  })

  it('honra el nombre viejo del orden por actividad reciente (`sort=default`)', () => {
    expect(parseRosterFilters({ sort: 'default' }).sort).toBe('recientes')
  })

  it('falls back to defaults on invalid values', () => {
    expect(parseRosterFilters({ attn: 'bogus', sort: 'nope' })).toEqual({
      search: '',
      attention: 'all',
      sort: 'attention',
    })
  })

  it('takes the first value of an array param', () => {
    expect(parseRosterFilters({ q: ['ana', 'ignored'] }).search).toBe('ana')
  })
})

describe('serializeRosterFilters', () => {
  it('omits defaults', () => {
    expect(serializeRosterFilters({ search: '', attention: 'all', sort: 'attention' })).toEqual({})
  })

  it('emits only non-default params, trimmed', () => {
    expect(
      serializeRosterFilters({ search: '  ana ', attention: 'draft_pending', sort: 'name' }),
    ).toEqual({ q: 'ana', attn: 'draft_pending', sort: 'name' })
  })

  it('round-trips through parse', () => {
    const original: RosterFilters = {
      search: 'jose',
      attention: 'draft_pending',
      sort: 'activity',
    }
    expect(parseRosterFilters(serializeRosterFilters(original))).toEqual(original)
  })
})

describe('fechas ISO', () => {
  it('isoDaysBetween cuenta dias enteros y tolera basura', () => {
    expect(isoDaysBetween('2026-08-01', '2026-08-05')).toBe(4)
    expect(isoDaysBetween('2026-08-05', '2026-08-05')).toBe(0)
    expect(isoDaysBetween('nope', '2026-08-05')).toBeNull()
  })

  it('isoShiftDays cruza fin de mes sin correrse', () => {
    expect(isoShiftDays('2026-08-05', -6)).toBe('2026-07-30')
    expect(isoShiftDays('nope', -1)).toBe('')
  })
})

describe('daysSinceLastEntry', () => {
  it('usa el ultimo dia CON registros de days7d', () => {
    expect(
      daysSinceLastEntry(
        {
          lastIntakeAt: null,
          days7d: [
            { date: '2026-08-01', entryCount: 2, consumedCalories: 1000, targetCalories: null },
            { date: '2026-08-03', entryCount: 1, consumedCalories: 800, targetCalories: null },
          ],
        },
        ctx,
      ),
    ).toBe(2)
  })

  it('ignora dias con entryCount 0', () => {
    expect(
      daysSinceLastEntry(
        {
          lastIntakeAt: null,
          days7d: [
            { date: '2026-08-04', entryCount: 0, consumedCalories: 0, targetCalories: null },
            { date: '2026-08-01', entryCount: 3, consumedCalories: 900, targetCalories: null },
          ],
        },
        ctx,
      ),
    ).toBe(4)
  })

  it('cae a lastIntakeAt cuando el item viejo no trae days7d', () => {
    expect(daysSinceLastEntry({ lastIntakeAt: '2026-08-03T15:00:00Z', days7d: [] }, ctx)).toBe(2)
  })

  it('null cuando no hay ninguna señal', () => {
    expect(daysSinceLastEntry({ lastIntakeAt: null }, ctx)).toBeNull()
  })
})

describe('pickWeeklyDrops', () => {
  it('solo alumnos con >=3 dias la semana previa y caida >=2', () => {
    const items = [
      item({ clientId: 'cae4', clientName: 'Cae 4', activeDaysPrev7d: 6, activeDays7d: 2 }),
      item({ clientId: 'cae2', clientName: 'Cae 2', activeDaysPrev7d: 4, activeDays7d: 2 }),
      // caida de 1: ruido
      item({ clientId: 'cae1', clientName: 'Cae 1', activeDaysPrev7d: 5, activeDays7d: 4 }),
      // base baja: nunca fue habito
      item({ clientId: 'baja', clientName: 'Base baja', activeDaysPrev7d: 2, activeDays7d: 0 }),
    ]
    expect(pickWeeklyDrops(items).map((d) => d.clientId)).toEqual(['cae4', 'cae2'])
  })

  it('ordena por mayor caida y corta en el top 3', () => {
    const items = [
      item({ clientId: 'a', activeDaysPrev7d: 5, activeDays7d: 3 }),
      item({ clientId: 'b', activeDaysPrev7d: 7, activeDays7d: 0 }),
      item({ clientId: 'c', activeDaysPrev7d: 6, activeDays7d: 1 }),
      item({ clientId: 'd', activeDaysPrev7d: 4, activeDays7d: 1 }),
    ]
    expect(pickWeeklyDrops(items, 3).map((d) => d.clientId)).toEqual(['b', 'c', 'd'])
  })

  it('items viejos sin activeDaysPrev7d no generan franja', () => {
    expect(pickWeeklyDrops([item({ clientId: 'legacy' })])).toEqual([])
  })

  it('propaga el telefono para el CTA de WhatsApp', () => {
    const drops = pickWeeklyDrops([
      item({ clientId: 'x', phone: '+56 9 1234 5678', activeDaysPrev7d: 5, activeDays7d: 1 }),
    ])
    expect(drops[0]?.phone).toBe('+56 9 1234 5678')
    expect(drops[0]?.drop).toBe(4)
  })
})

describe('attentionReasonLabel', () => {
  it('no_plan y draft_pending tienen copy fijo', () => {
    expect(attentionReasonLabel(item({ clientId: 'a', attentionReason: 'no_plan' }), ctx)).toBe(
      'Sin plan publicado',
    )
    expect(
      attentionReasonLabel(item({ clientId: 'b', attentionReason: 'draft_pending' }), ctx),
    ).toBe('Borrador sin publicar')
  })

  it('no_recent_intake dice cuantos dias reales pasaron', () => {
    expect(
      attentionReasonLabel(
        item({
          clientId: 'c',
          attentionReason: 'no_recent_intake',
          lastIntakeAt: '2026-07-28T12:00:00Z',
        }),
        ctx,
      ),
    ).toBe('Sin registro hace 8 días')
  })

  it('sin lastIntakeAt (fuera de los 90 dias del RPC) lo dice explicito', () => {
    expect(
      attentionReasonLabel(item({ clientId: 'd', attentionReason: 'no_recent_intake' }), ctx),
    ).toBe('Sin registros en 90 días')
  })

  it('singular en 1 dia', () => {
    expect(
      attentionReasonLabel(
        item({
          clientId: 'e',
          attentionReason: 'no_recent_intake',
          lastIntakeAt: '2026-08-04T12:00:00Z',
        }),
        ctx,
      ),
    ).toBe('Sin registro hace 1 día')
  })

  it('none no muestra motivo', () => {
    expect(attentionReasonLabel(item({ clientId: 'f' }), ctx)).toBeNull()
  })
})

describe('WhatsApp (wa.me)', () => {
  it('normalizePhoneDigits deja solo digitos', () => {
    expect(normalizePhoneDigits('+56 9 1234-5678')).toBe('56912345678')
    expect(normalizePhoneDigits('sin numeros')).toBeNull()
    expect(normalizePhoneDigits(null)).toBeNull()
    expect(normalizePhoneDigits(undefined)).toBeNull()
  })

  it('whatsappHref arma el link con y sin texto', () => {
    expect(whatsappHref('+56 9 1234 5678')).toBe('https://wa.me/56912345678')
    expect(whatsappHref('+56912345678', 'Hola Ana')).toBe(
      'https://wa.me/56912345678?text=Hola%20Ana',
    )
  })

  it('sin telefono no hay link (nunca un wa.me vacio)', () => {
    expect(whatsappHref(null)).toBeNull()
    expect(whatsappHref('')).toBeNull()
  })

  it('el mensaje sugerido usa el primer nombre', () => {
    expect(weeklyDropMessage('Ana María Pérez')).toBe(
      'Hola Ana, vi que esta semana registraste menos tus comidas. ¿Cómo vas? ¿Te ayudo a retomar?',
    )
  })
})

describe('buildContactList', () => {
  it('una linea por alumno con su motivo', () => {
    const items = [
      item({ clientId: 'a', clientName: 'Ana', attentionReason: 'no_plan' }),
      item({ clientId: 'b', clientName: 'Bruno' }),
    ]
    expect(buildContactList(items, ctx)).toBe('Ana — Sin plan publicado\nBruno — Al día')
  })

  it('lista vacia => string vacio', () => {
    expect(buildContactList([], ctx)).toBe('')
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

  it('transporta el score del keyset por atencion', () => {
    const stack = [
      { updatedAt: '2026-07-14T18:00:00.000Z', clientId: '11111111-1111-4111-8111-111111111111', score: 21000 },
    ]
    const encoded = encodeCursorStack(stack)
    expect(encoded).toContain('|21000')
    expect(parseCursorStack(encoded)).toEqual(stack)
  })

  it('sigue leyendo entradas viejas de dos campos (sin score)', () => {
    expect(parseCursorStack('2026-07-14T18:00:00.000Z|11111111-1111-4111-8111-111111111111')).toEqual([
      { updatedAt: '2026-07-14T18:00:00.000Z', clientId: '11111111-1111-4111-8111-111111111111' },
    ])
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

describe('parseCursorScore', () => {
  it('lee enteros y descarta basura', () => {
    expect(parseCursorScore('21000')).toBe(21000)
    expect(parseCursorScore(['300', 'x'])).toBe(300)
    expect(parseCursorScore('abc')).toBeNull()
    expect(parseCursorScore('')).toBeNull()
    expect(parseCursorScore(undefined)).toBeNull()
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
      expect(option.label).not.toMatch(/V2/)
    }
  })
})
