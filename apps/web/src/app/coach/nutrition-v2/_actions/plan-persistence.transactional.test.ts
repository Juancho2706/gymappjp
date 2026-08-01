import { describe, expect, it, vi } from 'vitest'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

// Mocks de modulos server-only cargados por plan-persistence (mismo patron que el resto de la
// suite del modulo). La rutina bajo prueba solo usa el `db` inyectado.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({ nutritionV2CoachScopeFromWorkspace: vi.fn() }))
vi.mock('@/services/auth/current-coach.service', () => ({
  getCurrentCoachSession: vi.fn(),
}))

import { persistAndPublishDraft, type NutritionV2Db } from './plan-persistence'

// NUT-011 — contrato del thin caller sobre `persist_and_publish_nutrition_plan_v2`:
// una sola llamada, idempotencia por clave, errores tipados y CERO efectos cuando falla.

const CLIENT = '6a8adf41-f971-45ca-9e62-69aa2d9638c4'
const COACH = '22222222-2222-4222-8222-222222222222'
const PLAN = '44444444-4444-4444-8444-444444444444'
const VERSION = '55555555-5555-4555-8555-555555555555'
const KEY = 'publish:cliente:draft-hash-estable'

function draft(): NutritionPlanDraft {
  return NutritionPlanDraftSchema.parse({
    planId: PLAN,
    clientId: CLIENT,
    name: 'Plan',
    strategy: 'flexible',
    effectiveFrom: '2026-07-28',
    permissions: {},
    dayVariants: [
      { key: 'default', label: 'Todos los dias', default: true, targets: { calories: 2000 }, mealSlots: [] },
    ],
  })
}

interface Writes {
  table: string
}

/**
 * Fake del cliente Supabase con una tabla `nutrition_plan_versions_v2` en memoria: la RPC
 * simulada crea UNA version por clave de idempotencia y devuelve la existente en los retries
 * (mismo contrato que la funcion SQL).
 */
function makeIdempotentDb(writes: Writes[]) {
  const byKey = new Map<string, { versionId: string; planId: string }>()
  let seq = 0
  const rpc = vi.fn(async (_name: string, args?: Record<string, unknown>) => {
    const key = String(args?.p_idempotency_key ?? '')
    const existing = byKey.get(key)
    if (existing) return { data: { ...existing, reusedIdempotencyKey: true }, error: null }
    seq += 1
    const created = { versionId: `${VERSION.slice(0, -1)}${seq}`, planId: PLAN }
    byKey.set(key, created)
    return { data: { ...created, reusedIdempotencyKey: false }, error: null }
  })
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        select: self,
        eq: self,
        order: self,
        limit: self,
        maybeSingle: async () => ({ data: null, error: null }),
        insert: () => {
          writes.push({ table })
          return {
            select: () => ({ single: async () => ({ data: { id: 'row-1' }, error: null }) }),
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }
        },
      })
      return chain
    },
    rpc,
  } as unknown as NutritionV2Db
  return { db, rpc }
}

function makeFailingDb(error: { message: string; code?: string }, writes: Writes[]) {
  const { db, rpc } = makeIdempotentDb(writes)
  ;(db.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ data: null, error }))
  return { db, rpc }
}

describe('persistAndPublishDraft — contrato transaccional (NUT-011)', () => {
  it('reintentar con la MISMA clave devuelve el mismo versionId (no duplica version)', async () => {
    const writes: Writes[] = []
    const { db, rpc } = makeIdempotentDb(writes)

    const first = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draft(),
      idempotencyKey: KEY,
      effectiveFrom: '2026-07-28',
    })
    const retry = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draft(),
      idempotencyKey: KEY,
      effectiveFrom: '2026-07-28',
    })

    expect(first).toEqual(retry)
    expect(first.ok).toBe(true)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(writes).toEqual([])
  })

  it('una clave distinta si produce una version nueva (el retry no enmascara ediciones)', async () => {
    const writes: Writes[] = []
    const { db } = makeIdempotentDb(writes)

    const first = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draft(),
      idempotencyKey: KEY,
      effectiveFrom: '2026-07-28',
    })
    const second = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draft(),
      idempotencyKey: `${KEY}-v2`,
      effectiveFrom: '2026-07-28',
    })

    expect(first.ok && second.ok).toBe(true)
    if (first.ok && second.ok) expect(first.versionId).not.toBe(second.versionId)
  })

  it('CAS desfasado => STALE_BASE tipado con copy de recarga', async () => {
    const writes: Writes[] = []
    const { db } = makeFailingDb(
      { message: 'nutrition_v2_publish_stale_base', code: '22023' },
      writes,
    )

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draft(),
      idempotencyKey: KEY,
      effectiveFrom: '2026-07-28',
      expectedCurrentVersionId: '77777777-7777-4777-8777-777777777777',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.code).toBe('STALE_BASE')
      expect(res.error).toContain('Recarga')
    }
    expect(writes).toEqual([])
  })

  it('scope denegado => SCOPE_DENIED y ninguna escritura', async () => {
    const writes: Writes[] = []
    const { db } = makeFailingDb(
      { message: 'nutrition_v2_persist_scope_denied', code: '42501' },
      writes,
    )

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draft(),
      idempotencyKey: KEY,
      effectiveFrom: '2026-07-28',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('SCOPE_DENIED')
    expect(writes).toEqual([])
  })

  it('fallo generico de la RPC => WRITE_FAILED sin efectos (la tx revierte el arbol)', async () => {
    const writes: Writes[] = []
    const { db } = makeFailingDb({ message: 'connection reset', code: 'XX000' }, writes)

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draft(),
      idempotencyKey: KEY,
      effectiveFrom: '2026-07-28',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('WRITE_FAILED')
    expect(writes).toEqual([])
  })

  it('respuesta inesperada de la RPC => INVALID_RESPONSE (no se inventa un versionId)', async () => {
    const writes: Writes[] = []
    const { db } = makeIdempotentDb(writes)
    ;(db.rpc as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({
      data: { versionId: 'no-es-un-uuid' },
      error: null,
    }))

    const res = await persistAndPublishDraft({
      db,
      userId: COACH,
      draft: draft(),
      idempotencyKey: KEY,
      effectiveFrom: '2026-07-28',
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_RESPONSE')
  })
})
