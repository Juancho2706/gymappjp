import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Server actions del panel «Registros de hoy» (W4.1, SPEC §7.1).
 *
 * Lo que se fija acá: (1) el payload se valida ANTES de tocar la sesión; (2) el gate real del
 * coach (`authorizeCoach`) corre siempre y su `ActionFailure` sale tal cual, sin escribir; (3) la
 * escritura va por los RPC auditados (`void_`/`correct_nutrition_intake_v2`), nunca por un UPDATE;
 * (4) la corrección RE-LEE la fila server-side y solo cambia la cantidad — alimento, unidad, franja
 * y snapshot congelado (con `macrosBasis`) viajan igual que el original; (5) la ficha se revalida
 * solo cuando la escritura entró.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({ nutritionV2CoachScopeFromWorkspace: vi.fn() }))
vi.mock('@/services/auth/current-coach.service', () => ({ getCurrentCoachSession: vi.fn() }))

const mocks = vi.hoisted(() => ({ authorizeCoach: vi.fn() }))

vi.mock('@/app/coach/nutrition-v2/_actions/plan-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/coach/nutrition-v2/_actions/plan-persistence')>()),
  authorizeCoach: mocks.authorizeCoach,
}))

import { revalidatePath } from 'next/cache'
import { correctIntakeQuantityAsCoach, voidIntakeAsCoach } from './coach-intake.actions'

const CLIENT_ID = '6a8adf41-f971-45ca-9e62-69aa2d9638c4'
const ENTRY_ID = '44444444-4444-4444-8444-444444444444'
const NEW_ENTRY_ID = '55555555-5555-4555-8555-555555555555'

const ENTRY_ROW = {
  id: ENTRY_ID,
  client_id: CLIENT_ID,
  log_date: '2026-09-06',
  food_id: '77777777-7777-4777-8777-777777777777',
  custom_name: null,
  quantity: 60,
  unit: 'un',
  occurred_at: '2026-09-06T16:04:00.000Z',
  timezone: 'America/Santiago',
  note: null,
  entry_status: 'active',
  meal_slot_v2: 'lunch',
  intake_source_v2: 'prescription',
  capture_method_v2: 'prescription',
  snapshot_name: 'Pan pita',
  snapshot_brand: null,
  snapshot_calories: '159.6',
  snapshot_protein_g: '5.4',
  snapshot_carbs_g: '33',
  snapshot_fats_g: '0.7',
  snapshot_fiber_g: null,
  snapshot_serving_size: '100',
  snapshot_serving_unit: 'g',
  snapshot_macros_basis: 'per_serving',
}

const rpc = vi.fn()
const maybeSingle = vi.fn()
const selectedColumns = vi.fn()
const filters: Array<[string, unknown]> = []

const db = {
  rpc: (name: string, args: Record<string, unknown>) => rpc(name, args),
  from: (table: string) => {
    if (table !== 'nutrition_intake_entries') throw new Error(`tabla inesperada: ${table}`)
    const chain = {
      select: (columns: string) => {
        selectedColumns(columns)
        return chain
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value])
        return chain
      },
      maybeSingle: () => maybeSingle(),
    }
    return chain
  },
}

function rpcArgs(name: string): Record<string, unknown> {
  const call = rpc.mock.calls.find(([called]) => called === name)
  if (!call) throw new Error(`no se llamó a ${name}`)
  return call[1] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  filters.length = 0
  mocks.authorizeCoach.mockResolvedValue({ ok: true, db, userId: 'coach-1', proCtx: {}, workspace: null })
  maybeSingle.mockResolvedValue({ data: ENTRY_ROW, error: null })
  rpc.mockImplementation((name: string) => ({
    data: name === 'void_nutrition_intake_v2' ? ENTRY_ID : NEW_ENTRY_ID,
    error: null,
  }))
})

describe('voidIntakeAsCoach', () => {
  it('llama al RPC terminal con motivo fijo e idempotency del coach, y revalida la ficha', async () => {
    const result = await voidIntakeAsCoach({ clientId: CLIENT_ID, entryId: ENTRY_ID })

    expect(result).toEqual({ ok: true, id: ENTRY_ID })
    expect(rpc).toHaveBeenCalledTimes(1)
    const args = rpcArgs('void_nutrition_intake_v2')
    expect(args).toMatchObject({
      p_client_id: CLIENT_ID,
      p_entry_id: ENTRY_ID,
      p_reason: 'Registro retirado por el coach',
    })
    expect(args.p_idempotency_key).toMatch(new RegExp(`^coach-void-${ENTRY_ID}-`))
    expect(revalidatePath).toHaveBeenCalledWith(`/coach/nutrition-v2/${CLIENT_ID}`)
  })

  it('payload inválido: ni sesión ni escritura', async () => {
    const result = await voidIntakeAsCoach({ clientId: 'no-uuid', entryId: ENTRY_ID })

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(mocks.authorizeCoach).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('el fallo del gate del coach sale tal cual, sin tocar la base', async () => {
    mocks.authorizeCoach.mockResolvedValue({ ok: false, code: 'RATE_LIMITED', error: 'Demasiadas solicitudes.' })

    const result = await voidIntakeAsCoach({ clientId: CLIENT_ID, entryId: ENTRY_ID })

    expect(result).toMatchObject({ ok: false, code: 'RATE_LIMITED' })
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('42501 del RPC => SCOPE_DENIED y sin revalidar', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'nutrition_v2_void_scope_denied', code: '42501' } })

    const result = await voidIntakeAsCoach({ clientId: CLIENT_ID, entryId: ENTRY_ID })

    expect(result).toMatchObject({ ok: false, code: 'SCOPE_DENIED' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('correctIntakeQuantityAsCoach', () => {
  it('re-lee la fila acotada por alumno y solo cambia la cantidad', async () => {
    const result = await correctIntakeQuantityAsCoach({
      clientId: CLIENT_ID,
      entryId: ENTRY_ID,
      quantity: 2,
    })

    expect(result).toEqual({ ok: true, id: NEW_ENTRY_ID })
    // El scope del alumno se impone en el propio SELECT: un entryId ajeno no matchea.
    expect(filters).toEqual([
      ['id', ENTRY_ID],
      ['client_id', CLIENT_ID],
    ])

    const args = rpcArgs('correct_nutrition_intake_v2')
    expect(args).toMatchObject({
      p_corrects_entry_id: ENTRY_ID,
      p_correction_reason: 'Cantidad corregida por el coach',
      p_client_id: CLIENT_ID,
      p_local_date: '2026-09-06',
      p_occurred_at: '2026-09-06T16:04:00.000Z',
      p_timezone: 'America/Santiago',
      p_food_id: ENTRY_ROW.food_id,
      p_quantity: 2,
      p_unit: 'un',
      p_meal_slot: 'lunch',
      p_source: 'prescription',
      p_capture_method: 'prescription',
      // El RPC hereda versión e ítem del ORIGINAL: mandarlos sería fingir autoridad.
      p_plan_version_id: null,
      p_prescription_item_id: null,
    })
    expect(args.p_idempotency_key).toMatch(new RegExp(`^coach-correct-${ENTRY_ID}-`))
    // Snapshot congelado byte a byte (numéricos ya parseados) + la base de macros: sin ella la
    // corrección reescalaría con la fórmula legada (NUT-001).
    expect(args.p_snapshot).toEqual({
      name: 'Pan pita',
      brand: null,
      calories: 159.6,
      proteinG: 5.4,
      carbsG: 33,
      fatsG: 0.7,
      fiberG: null,
      servingSize: 100,
      servingUnit: 'g',
      macrosBasis: 'per_serving',
    })
    expect(revalidatePath).toHaveBeenCalledWith(`/coach/nutrition-v2/${CLIENT_ID}`)
  })

  it('una entry legada sin macrosBasis no la inventa', async () => {
    maybeSingle.mockResolvedValue({ data: { ...ENTRY_ROW, snapshot_macros_basis: null }, error: null })

    await correctIntakeQuantityAsCoach({ clientId: CLIENT_ID, entryId: ENTRY_ID, quantity: 2 })

    expect(rpcArgs('correct_nutrition_intake_v2').p_snapshot).not.toHaveProperty('macrosBasis')
  })

  it('cantidad inválida: ni sesión ni escritura', async () => {
    const result = await correctIntakeQuantityAsCoach({
      clientId: CLIENT_ID,
      entryId: ENTRY_ID,
      quantity: 0,
    })

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' })
    expect(mocks.authorizeCoach).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('registro de otro alumno (o ya borrado): ENTRY_NOT_FOUND sin escribir', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await correctIntakeQuantityAsCoach({
      clientId: CLIENT_ID,
      entryId: ENTRY_ID,
      quantity: 2,
    })

    expect(result).toMatchObject({ ok: false, code: 'ENTRY_NOT_FOUND' })
    expect(rpc).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('registro ya retirado o corregido: ENTRY_NOT_ACTIVE sin escribir', async () => {
    maybeSingle.mockResolvedValue({ data: { ...ENTRY_ROW, entry_status: 'voided' }, error: null })

    const result = await correctIntakeQuantityAsCoach({
      clientId: CLIENT_ID,
      entryId: ENTRY_ID,
      quantity: 2,
    })

    expect(result).toMatchObject({ ok: false, code: 'ENTRY_NOT_ACTIVE' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('entry V1 (sin occurred_at ni snapshot): LEGACY_ENTRY sin escribir', async () => {
    maybeSingle.mockResolvedValue({
      data: { ...ENTRY_ROW, occurred_at: null, snapshot_name: null },
      error: null,
    })

    const result = await correctIntakeQuantityAsCoach({
      clientId: CLIENT_ID,
      entryId: ENTRY_ID,
      quantity: 2,
    })

    expect(result).toMatchObject({ ok: false, code: 'LEGACY_ENTRY' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
