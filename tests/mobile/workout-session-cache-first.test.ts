// @vitest-environment jsdom
/**
 * «La red no gatea el primer pintado» (specs/despegue-rapido · R1 / B1 · Sentry `EVA-MOBILE-F`).
 *
 * El hook REAL (`apps/mobile/lib/workout-session.ts`) se monta con:
 *   · el plan YA en la caché offline (`getCachedPlan` devuelve bloques), y
 *   · la RED muerta de la peor forma posible: `getClientProfile()` (que por dentro hace
 *     `auth.getUser()`) y el select del plan devuelven promesas que NUNCA resuelven.
 *
 * Antes del fix el `await clientPromise` estaba ARRIBA de la caché, así que este montaje se quedaba
 * en `loading: true` para siempre: el ExecutorV3 nunca llamaba `signalMorphSceneReady()` y el
 * Despegue agotaba su fallback de 4,6 s («ESTO ESTÁ TARDANDO») con la rutina sentada en el disco.
 *
 * GOTCHA de entorno: `tests/mobile/**\/*.test.ts` corre en el project `mobile-node`; este archivo
 * pide jsdom por cabecera (mecanismo de `vitest.config.ts`) porque `renderHook` necesita react-dom.
 * GOTCHA de resolución: la cadena React Native se mockea por PATH ABSOLUTO con `vi.doMock` +
 * `import()` dinámico (mismo patrón que `tests/mobile/executor-v3-hold-module.test.ts`).
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const mobileFile = (...segments: string[]) => path.resolve(mobileDir, ...segments)

/** Promesa que jamás resuelve: la RED de un Galaxy S24 con datos móviles pésimos. */
const forever = () => new Promise<never>(() => {})

const getClientProfile = vi.fn(forever)

/** Un bloque cacheado, con lo mínimo que el hook mira para agrupar y pintar. */
const CACHED_BLOCK = {
  id: 'blk-1',
  order_index: 0,
  sets: 3,
  reps: '10',
  target_weight_kg: 40,
  tempo: null,
  rir: null,
  rest_time: '60',
  section: 'main',
  section_template_id: null,
  superset_group: null,
  progression_type: null,
  progression_value: null,
  progression_mode: null,
  is_override: null,
  notes: null,
  exercises: { id: 'ex-1', name: 'Sentadilla', muscle_group: 'piernas' },
}

vi.doMock(mobileDep('react-native'), () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
}))
vi.doMock(mobileDep('expo-router'), () => ({ useFocusEffect: () => {} }))
vi.doMock(mobileDep('@react-native-community/netinfo'), () => ({
  default: { addEventListener: () => () => {} },
}))
vi.doMock(mobileDep('@react-native-async-storage/async-storage'), () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}))
// El select del plan también cuelga: la fuente de verdad del server llega DESPUÉS, o no llega.
vi.doMock(mobileFile('lib', 'supabase.ts'), () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => forever() }) }) }) },
}))
vi.doMock(mobileFile('lib', 'client.ts'), () => ({ getClientProfile }))
vi.doMock(mobileFile('lib', 'entitlements.ts'), () => ({
  useEntitlements: () => ({ studentAccess: { state: 'ok' } }),
}))
vi.doMock(mobileFile('lib', 'offline-cache.ts'), () => ({
  cachePlan: vi.fn(),
  enqueueLog: vi.fn(),
  getCachedPlan: vi.fn(async () => ({ title: 'Día 1 · Empuje', blocks: [CACHED_BLOCK], activeWeekVariant: 'B' })),
  getPendingLogCount: vi.fn(async () => 0),
}))
vi.doMock(mobileFile('lib', 'start-program.ts'), () => ({
  shouldAutoStartProgram: vi.fn(() => false),
  startWorkoutProgram: vi.fn(),
}))
vi.doMock(mobileFile('lib', 'use-online.ts'), () => ({ checkOnline: vi.fn(async () => true) }))

const { useWorkoutSession } = await import('../../apps/mobile/lib/workout-session')
const { peekPlanCacheHint } = await import('../../apps/mobile/lib/plan-cache-hint')

describe('useWorkoutSession · la caché pinta ANTES de esperar auth/perfil', () => {
  it('con plan en caché y perfil que nunca vuelve: loading cae a false y los bloques se pintan', async () => {
    const { result } = renderHook(() => useWorkoutSession('plan-1'))

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    // El perfil sigue en vuelo (nunca resolvió) y aun así el alumno ya tiene su rutina.
    expect(getClientProfile).toHaveBeenCalled()
    expect(result.current.blocks).toHaveLength(1)
    expect(result.current.blocks[0].id).toBe('blk-1')
    expect(result.current.planTitle).toBe('Día 1 · Empuje')
    expect(result.current.activeWeekVariant).toBe('B')
    // Sin perfil no hay `clientId`: lo que depende de él (logs del día, historial, máximos) sigue
    // esperando, que es justamente el contrato — pintar antes, NO adivinar datos del alumno.
    expect(result.current.clientId).toBeNull()
    expect(result.current.sessionLogs).toEqual([])
    // Y la caché tampoco se convirtió en pantalla de error: hay rutina que mostrar.
    expect(result.current.loadError).toBeNull()
  })

  it('deja la pista `hasPlanCache` para el aviso del Despegue (EVA-MOBILE-F)', async () => {
    const { result } = renderHook(() => useWorkoutSession('plan-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(peekPlanCacheHint('plan-1')).toBe('yes')
    // La pista es POR plan: otro planId no hereda la del anterior.
    expect(peekPlanCacheHint('plan-2')).toBe('unknown')
  })
})
