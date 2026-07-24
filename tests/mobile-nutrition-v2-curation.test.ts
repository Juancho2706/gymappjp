import { describe, expect, it } from 'vitest'
import {
  createCoachFoodForCurationV2,
  formatRelativeDate,
  listMissingFoodCodesV2,
  resolveMissingFoodCodeV2,
  type CurationWriteClient,
} from '../apps/mobile/lib/nutrition-v2-curation.api'

// ---------------------------------------------------------------------------
// Mock del cliente supabase-js (subconjunto estructural que consume la curación).
// Cada `from(table)` devuelve encadenables thenables que resuelven un resultado
// preprogramado; el log registra inserts / updates / deletes para las aserciones.
// ---------------------------------------------------------------------------

type Result = { data: unknown; error: { code?: string; message?: string } | null }

interface MockOpts {
  missingSelect?: Result
  missingUpdate?: Result
  foodsSelect?: Result
  foodsInsert?: Result
  foodsDelete?: Result
}

function makeDb(opts: MockOpts = {}) {
  const log = {
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<Record<string, unknown>>,
    deletes: [] as Array<Record<string, unknown>>,
  }

  const db = {
    from(table: string) {
      if (table === 'food_catalog_missing_codes') {
        return {
          select() {
            const chain: Record<string, unknown> = {}
            const passthrough = () => chain
            chain.is = passthrough
            chain.order = passthrough
            chain.range = passthrough
            chain.eq = passthrough
            chain.ilike = passthrough
            chain.limit = passthrough
            chain.then = (resolve: (v: Result) => void) =>
              resolve(opts.missingSelect ?? { data: [], error: null })
            return chain
          },
          update(values: Record<string, unknown>) {
            log.updates.push(values)
            const chain: Record<string, unknown> = {}
            const passthrough = () => chain
            chain.eq = passthrough
            chain.is = passthrough
            chain.then = (resolve: (v: Result) => void) =>
              resolve(opts.missingUpdate ?? { data: null, error: null })
            return chain
          },
        }
      }
      if (table === 'foods') {
        return {
          select() {
            const chain: Record<string, unknown> = {}
            const passthrough = () => chain
            chain.eq = passthrough
            chain.is = passthrough
            chain.ilike = passthrough
            chain.order = passthrough
            chain.range = passthrough
            chain.limit = passthrough
            chain.then = (resolve: (v: Result) => void) =>
              resolve(opts.foodsSelect ?? { data: [], error: null })
            return chain
          },
          insert(rows: Record<string, unknown>) {
            log.inserts.push(rows)
            return {
              select() {
                return {
                  single: async () => opts.foodsInsert ?? { data: { id: 'new-food' }, error: null },
                }
              },
              then: (resolve: (v: Result) => void) => resolve({ data: null, error: null }),
            }
          },
          delete() {
            const captured: Record<string, unknown> = {}
            const chain: Record<string, unknown> = {}
            chain.eq = (col: string, val: unknown) => {
              captured[col] = val
              return chain
            }
            chain.then = (resolve: (v: Result) => void) => {
              log.deletes.push(captured)
              resolve(opts.foodsDelete ?? { data: null, error: null })
            }
            return chain
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }

  return { db: db as unknown as CurationWriteClient, log }
}

const MISSING_ID = '11111111-1111-4111-8111-111111111111'
const FOOD_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = 'coach-1'

function rawRow(i: number) {
  return {
    id: `id-${i}`,
    barcode: `770000000000${i}`,
    country_code: 'CL',
    sightings: i,
    first_seen_at: '2026-07-01T00:00:00.000Z',
    last_seen_at: '2026-07-10T00:00:00.000Z',
  }
}

// ---------------------------------------------------------------------------

describe('formatRelativeDate', () => {
  it('devuelve "Hoy" para la fecha actual', () => {
    expect(formatRelativeDate(new Date().toISOString())).toBe('Hoy')
  })

  it('devuelve "Ayer" para hace un dia', () => {
    expect(formatRelativeDate(new Date(Date.now() - 86_400_000).toISOString())).toBe('Ayer')
  })

  it('devuelve "Hace N dias" para varios dias', () => {
    expect(formatRelativeDate(new Date(Date.now() - 3 * 86_400_000).toISOString())).toBe('Hace 3 dias')
  })

  it('trata fechas futuras como "Hoy" (clamp a 0)', () => {
    expect(formatRelativeDate(new Date(Date.now() + 86_400_000).toISOString())).toBe('Hoy')
  })

  it('devuelve cadena vacia ante fecha invalida', () => {
    expect(formatRelativeDate('no-es-fecha')).toBe('')
  })
})

describe('listMissingFoodCodesV2', () => {
  it('mapea snake→camel y reporta hasMore=false con <21 filas', async () => {
    const { db } = makeDb({ missingSelect: { data: [rawRow(1), rawRow(2)], error: null } })
    const res = await listMissingFoodCodesV2({ db, offset: 0 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toHaveLength(2)
    expect(res.items[0]).toEqual({
      id: 'id-1',
      barcode: '7700000000001',
      countryCode: 'CL',
      sightings: 1,
      firstSeenAt: '2026-07-01T00:00:00.000Z',
      lastSeenAt: '2026-07-10T00:00:00.000Z',
    })
    expect(res.hasMore).toBe(false)
    expect(res.nextOffset).toBeNull()
  })

  it('con 21 filas recorta a 20 y avanza el offset', async () => {
    const data = Array.from({ length: 21 }, (_, i) => rawRow(i))
    const { db } = makeDb({ missingSelect: { data, error: null } })
    const res = await listMissingFoodCodesV2({ db, offset: 40 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toHaveLength(20)
    expect(res.hasMore).toBe(true)
    expect(res.nextOffset).toBe(60)
  })

  it('mapea 42501 a SCOPE_DENIED', async () => {
    const { db } = makeDb({ missingSelect: { data: null, error: { code: '42501' } } })
    const res = await listMissingFoodCodesV2({ db })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_DENIED' })
  })

  it('mapea otros errores a CURATION_READ_FAILED', async () => {
    const { db } = makeDb({ missingSelect: { data: null, error: { code: '500' } } })
    const res = await listMissingFoodCodesV2({ db })
    expect(res).toMatchObject({ ok: false, code: 'CURATION_READ_FAILED' })
  })
})

describe('resolveMissingFoodCodeV2', () => {
  it('vincula y escribe resolved_food_id + resolved_at', async () => {
    const { db, log } = makeDb()
    const res = await resolveMissingFoodCodeV2({ db, missingCodeId: MISSING_ID, resolvedFoodId: FOOD_ID })
    expect(res.ok).toBe(true)
    expect(log.updates[0].resolved_food_id).toBe(FOOD_ID)
    expect(typeof log.updates[0].resolved_at).toBe('string')
  })

  it('rechaza input vacio con INVALID_PAYLOAD', async () => {
    const { db } = makeDb()
    const res = await resolveMissingFoodCodeV2({ db, missingCodeId: '', resolvedFoodId: FOOD_ID })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })

  it('mapea 42501 a SCOPE_DENIED', async () => {
    const { db } = makeDb({ missingUpdate: { data: null, error: { code: '42501' } } })
    const res = await resolveMissingFoodCodeV2({ db, missingCodeId: MISSING_ID, resolvedFoodId: FOOD_ID })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_DENIED' })
  })
})

describe('createCoachFoodForCurationV2', () => {
  const validInput = {
    missingCodeId: MISSING_ID,
    name: 'Yogur natural',
    brand: 'Soprole',
    unit: 'g' as const,
    calories: 60,
    proteinG: 4,
    carbsG: 5,
    fatsG: 2,
  }

  it('crea el alimento con los campos coach-scoped y vincula', async () => {
    const { db, log } = makeDb({ foodsInsert: { data: { id: FOOD_ID }, error: null } })
    const res = await createCoachFoodForCurationV2({ db, userId: USER_ID, ...validInput })
    expect(res.ok).toBe(true)
    expect(log.inserts).toHaveLength(1)
    expect(log.inserts[0]).toMatchObject({
      name: 'Yogur natural',
      brand: 'Soprole',
      coach_id: USER_ID,
      org_id: null,
      serving_size: 100,
      serving_unit: 'g',
      is_liquid: false,
      category: 'otro',
      country_code: 'CL',
      catalog_source: 'coach',
      verification_status: 'coach_verified',
      protein_g: 4,
      carbs_g: 5,
      fats_g: 2,
    })
    expect(log.updates[0].resolved_food_id).toBe(FOOD_ID)
    expect(log.deletes).toHaveLength(0)
  })

  it('is_liquid=true cuando la unidad es ml', async () => {
    const { db, log } = makeDb()
    await createCoachFoodForCurationV2({ db, userId: USER_ID, ...validInput, unit: 'ml' })
    expect(log.inserts[0]).toMatchObject({ serving_unit: 'ml', is_liquid: true })
  })

  it('idempotencia: reusa un alimento existente por nombre normalizado (sin insertar)', async () => {
    const { db, log } = makeDb({
      foodsSelect: { data: [{ id: 'existing-food', name: 'YOGUR NATURAL' }], error: null },
    })
    const res = await createCoachFoodForCurationV2({ db, userId: USER_ID, ...validInput })
    expect(res.ok).toBe(true)
    expect(log.inserts).toHaveLength(0)
    expect(log.updates[0].resolved_food_id).toBe('existing-food')
  })

  it('compensa borrando el alimento recien creado si el vinculo falla', async () => {
    const { db, log } = makeDb({
      foodsInsert: { data: { id: FOOD_ID }, error: null },
      missingUpdate: { data: null, error: { code: '23503', message: 'fk' } },
    })
    const res = await createCoachFoodForCurationV2({ db, userId: USER_ID, ...validInput })
    expect(res).toMatchObject({ ok: false, code: 'CURATION_RESOLVE_FAILED' })
    expect(log.deletes).toHaveLength(1)
    expect(log.deletes[0]).toEqual({ id: FOOD_ID, coach_id: USER_ID })
  })

  it('NO compensa (no borra) si reuso un alimento preexistente y el vinculo falla', async () => {
    const { db, log } = makeDb({
      foodsSelect: { data: [{ id: 'existing-food', name: 'Yogur natural' }], error: null },
      missingUpdate: { data: null, error: { code: '23503', message: 'fk' } },
    })
    const res = await createCoachFoodForCurationV2({ db, userId: USER_ID, ...validInput })
    expect(res).toMatchObject({ ok: false, code: 'CURATION_RESOLVE_FAILED' })
    expect(log.deletes).toHaveLength(0)
  })

  it('mapea 42501 del insert a SCOPE_DENIED', async () => {
    const { db } = makeDb({ foodsInsert: { data: null, error: { code: '42501' } } })
    const res = await createCoachFoodForCurationV2({ db, userId: USER_ID, ...validInput })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_DENIED' })
  })

  it('rechaza macros fuera de rango con INVALID_PAYLOAD', async () => {
    const { db, log } = makeDb()
    const res = await createCoachFoodForCurationV2({ db, userId: USER_ID, ...validInput, calories: 3000 })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(log.inserts).toHaveLength(0)
  })

  it('rechaza nombre vacio con INVALID_PAYLOAD', async () => {
    const { db } = makeDb()
    const res = await createCoachFoodForCurationV2({ db, userId: USER_ID, ...validInput, name: '   ' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
})
