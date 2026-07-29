import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'

/**
 * Server actions de grupos de porciones propios (P-A) + regresion del guard de publish.
 *
 * Se verifica que la action: (1) valide con el contrato compartido ANTES de tocar la sesion,
 * (2) exija el gate real del builder (`authorizeCoach`: sesion + rate limit + rollout +
 * workspace) y devuelva su ActionFailure tal cual, (3) pase el scope 3-vias del workspace y
 * (4) revalide las superficies del coach. La ultima suite fija la regresion: si el coach borra
 * un grupo que un BORRADOR sigue usando, publicar falla cerrado con EXCHANGE_GROUP_NOT_FOUND
 * (el soft-delete lo saca de `xg_select`) — nunca un snapshot NULL.
 */

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/services/auth/workspace-render-cache', () => ({ getPreferredWorkspaceForRender: vi.fn() }))
vi.mock('@/services/nutrition-v2-rollout.service', () => ({ isNutritionV2Enabled: vi.fn() }))
vi.mock('@/services/nutrition-v2-read.service', () => ({ nutritionV2CoachScopeFromWorkspace: vi.fn() }))
vi.mock('@/app/coach/nutrition-plans/_data/nutrition-page.queries', () => ({
  getNutritionPlansPageCoach: vi.fn(),
}))

const mocks = vi.hoisted(() => ({
  authorizeCoach: vi.fn(),
  createCoachExchangeGroup: vi.fn(),
  updateCoachExchangeGroup: vi.fn(),
  deleteCoachExchangeGroup: vi.fn(),
}))

vi.mock('@/app/coach/nutrition-v2/_actions/plan-persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/coach/nutrition-v2/_actions/plan-persistence')>()),
  authorizeCoach: mocks.authorizeCoach,
}))

vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
  createCoachExchangeGroup: mocks.createCoachExchangeGroup,
  updateCoachExchangeGroup: mocks.updateCoachExchangeGroup,
  deleteCoachExchangeGroup: mocks.deleteCoachExchangeGroup,
}))

import { revalidatePath } from 'next/cache'
import {
  createExchangeGroupAction,
  deleteExchangeGroupAction,
  updateExchangeGroupAction,
} from './exchange-groups.actions'
import { resolveExchangeGroupsForDraft, type NutritionV2Db } from './plan-persistence'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from '@eva/nutrition-v2'

const CLIENT_ID = '6a8adf41-f971-45ca-9e62-69aa2d9638c4'
const GROUP_ID = '44444444-4444-4444-8444-444444444444'

const GROUP: ExchangeGroup = {
  id: GROUP_ID,
  slug: 'batido',
  code: 'SHK',
  name: 'Batido',
  coachId: 'coach-1',
  teamId: null,
  isSystem: false,
  refCalories: 180,
  refProteinG: 25,
  refCarbsG: 10,
  refFatsG: 3,
  color: '#3B82F6',
  sortOrder: 100,
  composedOf: null,
  macrosConfirmed: false,
}

const PAYLOAD = {
  clientId: CLIENT_ID,
  name: 'Batido',
  code: 'SHK',
  refCalories: 180,
  refProteinG: 25,
  refCarbsG: 10,
  refFatsG: 3,
  color: '#3B82F6',
}

const AUTH_OK = {
  ok: true as const,
  db: {} as never,
  userId: 'coach-1',
  proCtx: {} as never,
  workspace: { type: 'coach_team', teamId: 'team-9' } as never,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.authorizeCoach.mockResolvedValue(AUTH_OK)
  mocks.createCoachExchangeGroup.mockResolvedValue({ success: true, group: GROUP })
  mocks.updateCoachExchangeGroup.mockResolvedValue({ success: true, group: GROUP })
  mocks.deleteCoachExchangeGroup.mockResolvedValue({ success: true })
})

describe('createExchangeGroupAction', () => {
  it('crea, pasa el scope del workspace y revalida las superficies del coach', async () => {
    const res = await createExchangeGroupAction(PAYLOAD)
    expect(res).toEqual({ ok: true, group: GROUP })
    const [, input] = mocks.createCoachExchangeGroup.mock.calls[0]
    expect(input.actorCoachId).toBe('coach-1')
    expect(input.scope).toEqual({ orgId: null, activeTeamId: 'team-9' })
    expect(input.values.code).toBe('SHK')
    expect(revalidatePath).toHaveBeenCalledWith('/coach/nutrition-v2/' + CLIENT_ID)
    expect(revalidatePath).toHaveBeenCalledWith('/coach/nutrition-v2/' + CLIENT_ID + '/builder')
  })

  it('valida el payload ANTES de autorizar (nada de escribir con datos basura)', async () => {
    const res = await createExchangeGroupAction({ ...PAYLOAD, code: 'ABCD' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('INVALID_PAYLOAD')
    expect(mocks.authorizeCoach).not.toHaveBeenCalled()
    expect(mocks.createCoachExchangeGroup).not.toHaveBeenCalled()
  })

  it('rechaza is_system y composed_of en la frontera de la action', async () => {
    expect((await createExchangeGroupAction({ ...PAYLOAD, is_system: true })).ok).toBe(false)
    expect(
      (await createExchangeGroupAction({ ...PAYLOAD, composed_of: [{ code: 'P', portions: 1 }] })).ok,
    ).toBe(false)
    expect(mocks.createCoachExchangeGroup).not.toHaveBeenCalled()
  })

  it('sin clientId valido no hay gate posible ⇒ INVALID_PAYLOAD', async () => {
    const res = await createExchangeGroupAction({ ...PAYLOAD, clientId: 'nope' })
    expect(res.ok).toBe(false)
    expect(mocks.authorizeCoach).not.toHaveBeenCalled()
  })

  it('propaga el ActionFailure del gate (rollout apagado, sin sesion, rate limit)', async () => {
    mocks.authorizeCoach.mockResolvedValue({
      ok: false,
      code: 'ROLLOUT_DISABLED',
      error: 'La nueva experiencia de nutricion no esta habilitada.',
    })
    const res = await createExchangeGroupAction(PAYLOAD)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('ROLLOUT_DISABLED')
    expect(mocks.createCoachExchangeGroup).not.toHaveBeenCalled()
  })

  it('el error del servicio (codigo duplicado) llega al cliente sin revalidar', async () => {
    mocks.createCoachExchangeGroup.mockResolvedValue({
      success: false,
      error: 'Ya existe un grupo con el código «C». Elige otro.',
    })
    const res = await createExchangeGroupAction(PAYLOAD)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('«C»')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('updateExchangeGroupAction / deleteExchangeGroupAction', () => {
  it('editar exige groupId valido', async () => {
    expect((await updateExchangeGroupAction({ ...PAYLOAD, groupId: 'nope' })).ok).toBe(false)
    const res = await updateExchangeGroupAction({ ...PAYLOAD, groupId: GROUP_ID })
    expect(res).toEqual({ ok: true, group: GROUP })
  })

  it('eliminar devuelve el id y revalida', async () => {
    const res = await deleteExchangeGroupAction({ clientId: CLIENT_ID, groupId: GROUP_ID })
    expect(res).toEqual({ ok: true, groupId: GROUP_ID })
    expect(revalidatePath).toHaveBeenCalledWith('/coach/nutrition-v2/' + CLIENT_ID)
  })

  it('eliminar respeta el gate', async () => {
    mocks.authorizeCoach.mockResolvedValue({ ok: false, code: 'UNAUTHENTICATED', error: 'x' })
    const res = await deleteExchangeGroupAction({ clientId: CLIENT_ID, groupId: GROUP_ID })
    expect(res.ok).toBe(false)
    expect(mocks.deleteCoachExchangeGroup).not.toHaveBeenCalled()
  })
})

describe('regresion: publicar un borrador que usa un grupo propio ya eliminado', () => {
  function draftWithGroup(groupId: string): NutritionPlanDraft {
    return NutritionPlanDraftSchema.parse({
      clientId: CLIENT_ID,
      name: 'Plan',
      strategy: 'structured',
      effectiveFrom: '2026-07-20',
      permissions: {},
      dayVariants: [
        {
          key: 'default',
          label: 'Todos los dias',
          default: true,
          targets: {},
          mealSlots: [
            {
              code: 'slot-1',
              name: 'Almuerzo',
              items: [],
              exchangeTargets: [{ exchangeGroupId: groupId, portions: 2 }],
            },
          ],
        },
      ],
    })
  }

  /** Cliente RLS-scoped: un grupo soft-borrado ya NO es visible para `xg_select`. */
  function dbWithoutGroup(): NutritionV2Db {
    return {
      from() {
        const chain: Record<string, unknown> = {}
        Object.assign(chain, {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
          insert: () => chain,
          single: async () => ({ data: null, error: null }),
        })
        return chain as never
      },
      rpc: async () => ({ data: null, error: null }),
    }
  }

  it('falla cerrado con EXCHANGE_GROUP_NOT_FOUND (jamas snapshot NULL)', async () => {
    const res = await resolveExchangeGroupsForDraft(dbWithoutGroup(), draftWithGroup(GROUP_ID))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.code).toBe('EXCHANGE_GROUP_NOT_FOUND')
  })
})
