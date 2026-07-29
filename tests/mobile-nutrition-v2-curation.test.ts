import { describe, expect, it, vi } from 'vitest'
import type { NutritionV2CoachScope } from '@eva/nutrition-v2'
import {
  createCoachFoodForCurationV2,
  formatRelativeDate,
  listMissingFoodCodesV2,
  resolveMissingFoodCodeV2,
  type CurationWriteClient,
} from '../apps/mobile/lib/nutrition-v2-curation.api'

// ---------------------------------------------------------------------------
// Mock del cliente supabase-js: la curación ya no usa PostgREST, solo `rpc(...)`
// contra las funciones scoped. El log registra nombre + argumentos de cada llamada
// para assertar que el workspace activo viaja al servidor.
// ---------------------------------------------------------------------------

type Result = { data: unknown; error: { code?: string; message?: string } | null }

function makeDb(result: Result = { data: null, error: null }) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const db = {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return result
    }),
  }
  return { db: db as unknown as CurationWriteClient, calls, rpc: db.rpc }
}

const MISSING_ID = '11111111-1111-4111-8111-111111111111'
const FOOD_ID = '22222222-2222-4222-8222-222222222222'
const TEAM_ID = '33333333-3333-4333-8333-333333333333'

const STANDALONE: NutritionV2CoachScope = { scopeType: 'standalone', teamId: null, orgId: null }
const TEAM: NutritionV2CoachScope = { scopeType: 'team', teamId: TEAM_ID, orgId: null }

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
  it('llama la RPC scoped con el scope de equipo recibido', async () => {
    const { db, calls } = makeDb({ data: [rawRow(1)], error: null })
    const res = await listMissingFoodCodesV2({ db, scope: TEAM, offset: 0 })
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('list_missing_food_codes_scoped_v2')
    expect(calls[0].args).toMatchObject({
      p_scope_type: 'team',
      p_team_id: TEAM_ID,
      p_org_id: null,
      p_offset: 0,
      p_page_size: 21,
    })
  })

  it('sin scope devuelve SCOPE_REQUIRED sin tocar la DB', async () => {
    const { db, rpc } = makeDb()
    const res = await listMissingFoodCodesV2({ db, scope: null })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_REQUIRED' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('scope team sin teamId es fail-closed (SCOPE_REQUIRED, cero llamadas)', async () => {
    const { db, rpc } = makeDb()
    const res = await listMissingFoodCodesV2({
      db,
      scope: { scopeType: 'team', teamId: null, orgId: null } as NutritionV2CoachScope,
    })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_REQUIRED' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('mapea snake→camel y reporta hasMore=false con <21 filas', async () => {
    const { db } = makeDb({ data: [rawRow(1), rawRow(2)], error: null })
    const res = await listMissingFoodCodesV2({ db, scope: STANDALONE, offset: 0 })
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
    const { db } = makeDb({ data, error: null })
    const res = await listMissingFoodCodesV2({ db, scope: STANDALONE, offset: 40 })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.items).toHaveLength(20)
    expect(res.hasMore).toBe(true)
    expect(res.nextOffset).toBe(60)
  })

  it('mapea 42501 a SCOPE_DENIED', async () => {
    const { db } = makeDb({ data: null, error: { code: '42501' } })
    const res = await listMissingFoodCodesV2({ db, scope: STANDALONE })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_DENIED' })
  })

  it('mapea otros errores a CURATION_READ_FAILED', async () => {
    const { db } = makeDb({ data: null, error: { code: '500' } })
    const res = await listMissingFoodCodesV2({ db, scope: STANDALONE })
    expect(res).toMatchObject({ ok: false, code: 'CURATION_READ_FAILED' })
  })
})

describe('resolveMissingFoodCodeV2', () => {
  it('vincula por la RPC scoped pasando codigo, alimento y workspace', async () => {
    const { db, calls } = makeDb({ data: MISSING_ID, error: null })
    const res = await resolveMissingFoodCodeV2({
      db,
      scope: TEAM,
      missingCodeId: MISSING_ID,
      resolvedFoodId: FOOD_ID,
    })
    expect(res.ok).toBe(true)
    expect(calls[0].name).toBe('resolve_missing_food_code_scoped_v2')
    expect(calls[0].args).toEqual({
      p_missing_code_id: MISSING_ID,
      p_food_id: FOOD_ID,
      p_scope_type: 'team',
      p_team_id: TEAM_ID,
      p_org_id: null,
    })
  })

  it('sin scope devuelve SCOPE_REQUIRED sin tocar la DB', async () => {
    const { db, rpc } = makeDb()
    const res = await resolveMissingFoodCodeV2({
      db,
      scope: null,
      missingCodeId: MISSING_ID,
      resolvedFoodId: FOOD_ID,
    })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_REQUIRED' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza input vacio con INVALID_PAYLOAD', async () => {
    const { db, rpc } = makeDb()
    const res = await resolveMissingFoodCodeV2({
      db,
      scope: STANDALONE,
      missingCodeId: '',
      resolvedFoodId: FOOD_ID,
    })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('P0002 (cero filas actualizadas) => CURATION_ALREADY_RESOLVED, sin exito falso', async () => {
    const { db } = makeDb({ data: null, error: { code: 'P0002', message: 'not found' } })
    const res = await resolveMissingFoodCodeV2({
      db,
      scope: STANDALONE,
      missingCodeId: MISSING_ID,
      resolvedFoodId: FOOD_ID,
    })
    expect(res).toMatchObject({ ok: false, code: 'CURATION_ALREADY_RESOLVED' })
  })

  it('mapea 42501 a SCOPE_DENIED', async () => {
    const { db } = makeDb({ data: null, error: { code: '42501' } })
    const res = await resolveMissingFoodCodeV2({
      db,
      scope: STANDALONE,
      missingCodeId: MISSING_ID,
      resolvedFoodId: FOOD_ID,
    })
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

  it('crea y vincula en UNA sola llamada atomica con el scope activo', async () => {
    const { db, calls } = makeDb({ data: FOOD_ID, error: null })
    const res = await createCoachFoodForCurationV2({ db, scope: TEAM, ...validInput })
    expect(res.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('create_food_and_resolve_missing_code_scoped_v2')
    expect(calls[0].args).toEqual({
      p_missing_code_id: MISSING_ID,
      p_name: 'Yogur natural',
      p_calories: 60,
      p_protein_g: 4,
      p_carbs_g: 5,
      p_fats_g: 2,
      p_brand: 'Soprole',
      p_unit: 'g',
      p_scope_type: 'team',
      p_team_id: TEAM_ID,
      p_org_id: null,
    })
  })

  it('propaga la unidad ml', async () => {
    const { db, calls } = makeDb()
    await createCoachFoodForCurationV2({ db, scope: STANDALONE, ...validInput, unit: 'ml' })
    expect(calls[0].args).toMatchObject({ p_unit: 'ml', p_scope_type: 'standalone', p_team_id: null })
  })

  it('sin scope devuelve SCOPE_REQUIRED sin tocar la DB', async () => {
    const { db, rpc } = makeDb()
    const res = await createCoachFoodForCurationV2({ db, scope: null, ...validInput })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_REQUIRED' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('P0002 => CURATION_ALREADY_RESOLVED y ninguna compensacion (la RPC es atomica)', async () => {
    const { db, rpc } = makeDb({ data: null, error: { code: 'P0002', message: 'not found' } })
    const res = await createCoachFoodForCurationV2({ db, scope: STANDALONE, ...validInput })
    expect(res).toMatchObject({ ok: false, code: 'CURATION_ALREADY_RESOLVED' })
    // Una sola llamada: no hay insert previo que compensar con un delete.
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('mapea 42501 a SCOPE_DENIED', async () => {
    const { db } = makeDb({ data: null, error: { code: '42501' } })
    const res = await createCoachFoodForCurationV2({ db, scope: STANDALONE, ...validInput })
    expect(res).toMatchObject({ ok: false, code: 'SCOPE_DENIED' })
  })

  it('rechaza macros fuera de rango con INVALID_PAYLOAD sin tocar la DB', async () => {
    const { db, rpc } = makeDb()
    const res = await createCoachFoodForCurationV2({
      db,
      scope: STANDALONE,
      ...validInput,
      calories: 3000,
    })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza nombre vacio con INVALID_PAYLOAD', async () => {
    const { db } = makeDb()
    const res = await createCoachFoodForCurationV2({ db, scope: STANDALONE, ...validInput, name: '   ' })
    expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
  })
})
