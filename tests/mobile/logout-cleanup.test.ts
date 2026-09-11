// Logout que limpia SIN RED (ítem 17 del tren «Arreglos chicos pre-OTA», R10).
//
// Lo que se prueba de `signOutAndCleanup` (apps/mobile/lib/auth-actions.ts):
//   1. el id del usuario saliente se resuelve con `getSession()` (sesión guardada) y NUNCA con
//      `getUser()`, que siempre hace round-trip y en modo avión devolvía null ⇒ cero limpieza;
//   2. con ese id corren las limpiezas por-usuario (push + nutrición V2) y el guard de marca;
//   3. el guard de marca compara `coachId` (NO `storedForUserId`): la cache del ALUMNO trae el
//      coachId de SU coach y sobrevive al logout a propósito (decisión del owner del 12-08).
//
// GOTCHA de resolución (patrón de `coach-dashboard-agenda.test.ts:21-38`): los ids bare resuelven
// distinto desde `tests/` que desde `apps/mobile/`, así que las dependencias del módulo se mockean
// por PATH ABSOLUTO con `vi.doMock` + `import()` dinámico.
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

type Mod = typeof import('../../apps/mobile/lib/auth-actions')

const COACH_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const COACH_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

const getSession = vi.fn()
const getUser = vi.fn()
const signOut = vi.fn(async () => ({ error: null }))
const revokePushToken = vi.fn(async () => {})
const clearNutritionV2CacheForUser = vi.fn(async () => {})
const clearNutritionV2QueueForUser = vi.fn(async () => {})
const clearBranding = vi.fn(async () => {})
const loadStoredBranding = vi.fn(async () => null as { coachId?: string | null } | null)
const removeItem = vi.fn(async () => {})

async function loadModule(): Promise<Mod> {
  vi.resetModules()
  vi.doMock(mobileDep('@react-native-async-storage/async-storage'), () => ({
    default: { removeItem, getItem: vi.fn(async () => null), setItem: vi.fn(async () => {}) },
  }))
  vi.doMock(mobileDep('expo-router'), () => ({ router: { replace: vi.fn() } }))
  vi.doMock(mobileLib('supabase.ts'), () => ({
    supabase: { auth: { getSession, getUser, signOut, onAuthStateChange: vi.fn() } },
  }))
  vi.doMock(mobileLib('push.ts'), () => ({ revokePushToken }))
  vi.doMock(mobileLib('session-flags.ts'), () => ({ sessionFlags: { pwChanged: true } }))
  vi.doMock(mobileLib('nutrition-v2-cache.ts'), () => ({ clearNutritionV2CacheForUser }))
  vi.doMock(mobileLib('nutrition-v2-offline.ts'), () => ({ clearNutritionV2QueueForUser }))
  vi.doMock(mobileLib('branding.ts'), () => ({ clearBranding, loadStoredBranding }))
  vi.doMock(path.resolve(mobileDir, 'components', 'alumno', 'workout', 'v3', 'auto-rest-pref.ts'), () => ({
    resetAutoRestPref: vi.fn(),
  }))
  return (await import(mobileLib('auth-actions.ts'))) as Mod
}

/** Sesión guardada del coach que se va (lo que devuelve `getSession()` sin red). */
function localSession(userId: string | null) {
  return { data: { session: userId ? { user: { id: userId } } : null }, error: null }
}

describe('signOutAndCleanup — limpieza sin red (ítem 17)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSession.mockResolvedValue(localSession(COACH_A))
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    loadStoredBranding.mockResolvedValue(null)
    signOut.mockResolvedValue({ error: null })
  })

  it('resuelve el id con getSession() y jamás llama a getUser() (round-trip)', async () => {
    const { signOutAndCleanup } = await loadModule()

    await signOutAndCleanup()

    expect(getSession).toHaveBeenCalledTimes(1)
    expect(getUser).not.toHaveBeenCalled()
    // Con id resuelto, las limpiezas por-usuario corren aunque no haya red.
    expect(revokePushToken).toHaveBeenCalledWith(COACH_A, expect.anything())
    expect(clearNutritionV2CacheForUser).toHaveBeenCalledWith(COACH_A)
    expect(clearNutritionV2QueueForUser).toHaveBeenCalledWith(COACH_A)
    expect(signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('borra la marca cuando la cache es del coach que se va (coachId === saliente)', async () => {
    loadStoredBranding.mockResolvedValue({ coachId: COACH_A })
    const { signOutAndCleanup } = await loadModule()

    await signOutAndCleanup()

    expect(clearBranding).toHaveBeenCalledTimes(1)
  })

  it('NO borra la marca del coach del alumno (coachId de otro)', async () => {
    loadStoredBranding.mockResolvedValue({ coachId: COACH_B })
    const { signOutAndCleanup } = await loadModule()

    await signOutAndCleanup()

    expect(clearBranding).not.toHaveBeenCalled()
  })

  it('sin sesión guardada no inventa limpiezas por-usuario pero igual cierra sesión', async () => {
    getSession.mockResolvedValue(localSession(null))
    loadStoredBranding.mockResolvedValue({ coachId: COACH_A })
    const { signOutAndCleanup } = await loadModule()

    await signOutAndCleanup({ scope: 'local' })

    expect(revokePushToken).not.toHaveBeenCalled()
    expect(clearBranding).not.toHaveBeenCalled()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })
})
