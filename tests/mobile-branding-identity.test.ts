// P1 (QA device del owner, 10-09-2026) — «marca ajena en el teléfono compartido».
//
// Síntoma: el owner cerró sesión de su coach `josefit` (con white-label) y registró un coach NUEVO
// gratuito en el MISMO teléfono. El coach nuevo vio logo, colores, loader y nombre de josefit.
//
// Causa (tres capas, las tres blindadas acá):
//  1. `signOutAndCleanup` limpiaba push, nutrición V2 y el estado de cuenta del alumno, pero NUNCA
//     `eva_coach_branding` ⇒ la marca sobrevivía al logout.
//  2. La cache era ANÓNIMA: no sabía qué usuario la había escrito, así que `loadStoredBranding` se
//     la entregaba a cualquier sesión posterior.
//  3. `bootstrapOwnCoachBranding` devolvía `handled: false` cuando el coach nuevo no tenía marca,
//     así que nadie reseteaba nada y la ajena quedaba pintada.
//
// GOTCHA de resolución (mismo patrón que mobile-nutrition-v2-cache.test.ts y
// mobile-directory-pulse-parity.test.ts): apps/mobile tiene su PROPIA copia de AsyncStorage y sus
// módulos arrastran la cadena react-native/expo. Se mockean los paths REALES (`require.resolve` con
// `paths: [mobileDir]` para las deps, path absoluto para los módulos locales) con `vi.doMock` —no
// hoisteado— y el módulo bajo test se carga con `import()` dinámico DESPUÉS.
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const resolveMobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })

/** La MISMA clave que usa `apps/mobile/lib/branding.ts`. Si alguien la renombra, este test cae. */
const BRANDING_KEY = 'eva_coach_branding'

interface StoredShape {
  coachId: string
  coachSlug: string
  primaryColor: string
  displayName: string
  inviteCode: string
  storedForUserId?: string | null
}

function brandingFixture(over: Partial<StoredShape> = {}): StoredShape {
  return {
    coachId: 'coach-josefit',
    coachSlug: 'josefit',
    primaryColor: '#FF3D8B',
    displayName: 'JoseFit',
    inviteCode: 'JOSE1',
    ...over,
  }
}

let store: Map<string, string>
let removeItem: ReturnType<typeof vi.fn>
let sessionUserId: string | null
/** Fila que devuelve el `maybeSingle()` de `coaches` (null = no es coach / no legible). */
let coachRow: Record<string, unknown> | null

beforeEach(() => {
  vi.resetModules()
  store = new Map<string, string>()
  sessionUserId = null
  coachRow = null

  removeItem = vi.fn((key: string) => {
    store.delete(key)
    return Promise.resolve()
  })
  const asyncStorageMock = {
    getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
      return Promise.resolve()
    }),
    removeItem,
  }
  vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({
    default: asyncStorageMock,
  }))

  vi.doMock(mobileLib('supabase.ts'), () => ({
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({
            data: { session: sessionUserId ? { user: { id: sessionUserId } } : null },
          }),
        getUser: () =>
          Promise.resolve({ data: { user: sessionUserId ? { id: sessionUserId } : null } }),
        signOut: () => Promise.resolve({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: coachRow, error: null }) }),
        }),
      }),
    },
  }))
})

async function loadBranding() {
  return await import(mobileLib('branding.ts'))
}

describe('isStoredBrandingUsableFor — la regla de dueño, pura', () => {
  it('sin sesión la cache sirve: es el login del alumno por código, que la escribe PRE-login', async () => {
    const { isStoredBrandingUsableFor } = await loadBranding()
    expect(isStoredBrandingUsableFor(brandingFixture({ storedForUserId: 'user-a' }), null)).toBe(true)
    expect(isStoredBrandingUsableFor(brandingFixture({ storedForUserId: 'user-a' }), undefined)).toBe(true)
  })

  it('cache sin dueño (pre-login o app vieja) sirve para cualquier sesión', async () => {
    const { isStoredBrandingUsableFor } = await loadBranding()
    expect(isStoredBrandingUsableFor(brandingFixture(), 'user-b')).toBe(true)
    expect(isStoredBrandingUsableFor(brandingFixture({ storedForUserId: null }), 'user-b')).toBe(true)
  })

  it('dueño = sesión ⇒ sirve; dueño ≠ sesión ⇒ NO (el bug del owner)', async () => {
    const { isStoredBrandingUsableFor } = await loadBranding()
    expect(isStoredBrandingUsableFor(brandingFixture({ storedForUserId: 'user-a' }), 'user-a')).toBe(true)
    expect(isStoredBrandingUsableFor(brandingFixture({ storedForUserId: 'user-a' }), 'user-b')).toBe(false)
  })

  it('sin nada guardado no hay nada que descartar', async () => {
    const { isStoredBrandingUsableFor } = await loadBranding()
    expect(isStoredBrandingUsableFor(null, 'user-b')).toBe(true)
  })
})

describe('cache firmada por su dueño', () => {
  it('saveStoredBranding firma con el usuario de la sesión (y null sin sesión)', async () => {
    const { saveStoredBranding } = await loadBranding()

    sessionUserId = 'user-a'
    await saveStoredBranding(brandingFixture())
    expect(JSON.parse(store.get(BRANDING_KEY) as string).storedForUserId).toBe('user-a')

    sessionUserId = null
    await saveStoredBranding(brandingFixture())
    expect(JSON.parse(store.get(BRANDING_KEY) as string).storedForUserId).toBeNull()
  })

  it('loadStoredBranding con dueño DISTINTO no la devuelve y BORRA la clave', async () => {
    const { loadStoredBranding } = await loadBranding()
    store.set(BRANDING_KEY, JSON.stringify(brandingFixture({ storedForUserId: 'user-a' })))

    expect(await loadStoredBranding({ sessionUserId: 'user-b' })).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(BRANDING_KEY)
    expect(store.has(BRANDING_KEY)).toBe(false)
  })

  it('mismo dueño la devuelve intacta; sin `opts` el comportamiento previo no cambia', async () => {
    const { loadStoredBranding } = await loadBranding()
    store.set(BRANDING_KEY, JSON.stringify(brandingFixture({ storedForUserId: 'user-a' })))

    expect((await loadStoredBranding({ sessionUserId: 'user-a' }))?.displayName).toBe('JoseFit')
    expect((await loadStoredBranding())?.displayName).toBe('JoseFit')
    expect(store.has(BRANDING_KEY)).toBe(true)
  })
})

describe('bootstrapOwnCoachBranding — el coach nuevo no hereda la marca del anterior', () => {
  it('cache ajena + coach sin marca propia ⇒ la borra y pide panel EVA neutro', async () => {
    const { bootstrapOwnCoachBranding } = await loadBranding()
    store.set(BRANDING_KEY, JSON.stringify(brandingFixture({ storedForUserId: 'user-a' })))
    sessionUserId = 'user-nuevo'
    coachRow = null // el coach nuevo todavía no tiene fila de marca legible

    const result = await bootstrapOwnCoachBranding()
    expect(result).toEqual({ handled: true, branding: null })
    expect(store.has(BRANDING_KEY)).toBe(false)
  })

  it('sin cache ajena y sin marca propia sigue sin pisar nada (handled: false)', async () => {
    const { bootstrapOwnCoachBranding } = await loadBranding()
    sessionUserId = 'user-nuevo'
    coachRow = null

    expect(await bootstrapOwnCoachBranding()).toEqual({ handled: false, branding: null })
  })

  it('la marca PROPIA se guarda firmada por su dueño', async () => {
    const { bootstrapOwnCoachBranding } = await loadBranding()
    sessionUserId = 'user-nuevo'
    coachRow = {
      id: 'user-nuevo',
      slug: 'nuevocoach',
      primary_color: '#123456',
      brand_name: 'Nuevo Coach',
      invite_code: 'NUEVO1',
    }

    const result = await bootstrapOwnCoachBranding()
    expect(result.handled).toBe(true)
    expect(result.branding?.displayName).toBe('Nuevo Coach')
    expect(JSON.parse(store.get(BRANDING_KEY) as string).storedForUserId).toBe('user-nuevo')
  })
})

describe('signOutAndCleanup — el logout se lleva la marca SOLO si es la del que se va', () => {
  /** Los módulos que `auth-actions.ts` arrastra y que este test no ejerce. */
  function mockAuthActionsDeps() {
    vi.doMock(mobileLib('push.ts'), () => ({ revokePushToken: vi.fn(() => Promise.resolve()) }))
    vi.doMock(mobileLib('nutrition-v2-cache.ts'), () => ({
      clearNutritionV2CacheForUser: vi.fn(() => Promise.resolve()),
    }))
    vi.doMock(mobileLib('nutrition-v2-offline.ts'), () => ({
      clearNutritionV2QueueForUser: vi.fn(() => Promise.resolve()),
    }))
    vi.doMock(resolveMobileDep('expo-router'), () => ({ router: { replace: vi.fn() } }))
  }

  it('COACH: la cache es SUYA (`coachId` = su id) ⇒ se borra y el próximo usuario no la hereda', async () => {
    mockAuthActionsDeps()
    // La marca propia del coach siempre trae `coachId === userId` (la escribe `bootstrapOwnCoachBranding`).
    store.set(
      BRANDING_KEY,
      JSON.stringify(brandingFixture({ coachId: 'coach-a', storedForUserId: 'coach-a' })),
    )
    sessionUserId = 'coach-a'

    const { signOutAndCleanup } = await import(mobileLib('auth-actions.ts'))
    await signOutAndCleanup()

    expect(removeItem).toHaveBeenCalledWith(BRANDING_KEY)
    expect(store.has(BRANDING_KEY)).toBe(false)
  })

  it('COACH con cache LEGACY sin firma: `coachId` alcanza para reconocerla como suya y borrarla', async () => {
    mockAuthActionsDeps()
    // Entrada escrita antes de esta OTA: sin `storedForUserId`, pero con el `coachId` del saliente.
    store.set(BRANDING_KEY, JSON.stringify(brandingFixture({ coachId: 'coach-a' })))
    sessionUserId = 'coach-a'

    const { signOutAndCleanup } = await import(mobileLib('auth-actions.ts'))
    await signOutAndCleanup()

    expect(store.has(BRANDING_KEY)).toBe(false)
  })

  it('ALUMNO: la marca de SU coach SOBREVIVE al logout (decisión del owner 12-08)', async () => {
    // Regresión que este test blinda: con un `clearBranding()` incondicional, el alumno que cerraba
    // sesión perdía la marca de su coach y volvía a recorrer bienvenida → código → credenciales,
    // en vez de reentrar de un tap por el login branded (ver `app/alumno/(tabs)/perfil.tsx`).
    mockAuthActionsDeps()
    store.set(
      BRANDING_KEY,
      JSON.stringify(brandingFixture({ coachId: 'coach-a', storedForUserId: 'alumno-1' })),
    )
    sessionUserId = 'alumno-1'

    const { signOutAndCleanup } = await import(mobileLib('auth-actions.ts'))
    await signOutAndCleanup()

    expect(removeItem).not.toHaveBeenCalledWith(BRANDING_KEY)
    expect(store.has(BRANDING_KEY)).toBe(true)
  })

  it('ALUMNO: tras el logout la marca sigue disponible al volver a entrar con la MISMA cuenta', async () => {
    mockAuthActionsDeps()
    store.set(
      BRANDING_KEY,
      JSON.stringify(brandingFixture({ coachId: 'coach-a', storedForUserId: 'alumno-1' })),
    )
    sessionUserId = 'alumno-1'

    const { signOutAndCleanup } = await import(mobileLib('auth-actions.ts'))
    await signOutAndCleanup()

    // Reentrada: el guard de dueño la reconoce (la firmó este mismo alumno) y la devuelve intacta.
    const { loadStoredBranding } = await loadBranding()
    expect((await loadStoredBranding({ sessionUserId: 'alumno-1' }))?.displayName).toBe('JoseFit')
  })
})
