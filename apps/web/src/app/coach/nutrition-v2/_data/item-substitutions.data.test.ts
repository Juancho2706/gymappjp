import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// El data-loader es server-only: mockeamos el cliente Supabase y controlamos la respuesta.
const createClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ createClient: () => createClient() }))

import { fetchItemSubstitutionsForVersion } from './item-substitutions.data'

const VERSION = '55555555-5555-4555-8555-555555555555'
const ITEM = '66666666-6666-4666-8666-666666666666'

function dbReturning(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    select: self,
    eq: self,
    order: self,
    then: (resolve: (v: unknown) => void) => resolve(result),
  })
  return { from: () => chain }
}

const ROW = {
  id: '77777777-7777-4777-8777-777777777777',
  prescription_item_id: ITEM,
  food_id: null,
  recipe_id: null,
  snapshot_name: 'Atún',
  custom_name: null,
  snapshot_brand: null,
  quantity: 100,
  unit: 'g',
  snapshot_calories: 120,
  snapshot_protein_g: 26,
  snapshot_carbs_g: 0,
  snapshot_fats_g: 1,
  snapshot_fiber_g: null,
  order_index: 0,
}

describe('fetchItemSubstitutionsForVersion (NUT-008)', () => {
  beforeEach(() => {
    createClient.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sin versionId => ok:true con rows vacio (no toca la base)', async () => {
    const res = await fetchItemSubstitutionsForVersion(null)
    expect(res).toEqual({ ok: true, rows: [] })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('plan sin reemplazos => ok:true con rows vacio', async () => {
    createClient.mockResolvedValue(dbReturning({ data: [], error: null }))
    const res = await fetchItemSubstitutionsForVersion(VERSION)
    expect(res).toEqual({ ok: true, rows: [] })
  })

  it('lectura exitosa => ok:true con las filas mapeadas', async () => {
    createClient.mockResolvedValue(dbReturning({ data: [ROW], error: null }))
    const res = await fetchItemSubstitutionsForVersion(VERSION)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.rows).toHaveLength(1)
      expect(res.rows[0].prescriptionItemId).toBe(ITEM)
    }
  })

  it('error de la base => ok:false (NUNCA [] : publicar borraria los reemplazos)', async () => {
    createClient.mockResolvedValue(dbReturning({ data: null, error: { message: 'permission denied' } }))
    const res = await fetchItemSubstitutionsForVersion(VERSION)
    expect(res).toEqual({ ok: false })
    expect(console.error).toHaveBeenCalled()
  })

  it('excepcion (red/parse) => ok:false y loguea', async () => {
    createClient.mockRejectedValue(new Error('network down'))
    const res = await fetchItemSubstitutionsForVersion(VERSION)
    expect(res).toEqual({ ok: false })
    expect(console.error).toHaveBeenCalled()
  })
})
