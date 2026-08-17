// G3.1 (SPEC `nutrition-onboarding-tour`, D4): suite de la memoria de la Guía Viva en RN
// (apps/mobile/components/nutrition-v2/tour/tour-flags.ts). Cubre la forma de la clave, el
// aislamiento por coach y por tour, la versión EN la clave, el fail-closed cuando el storage
// revienta, y —lo que de verdad importa— que la clave sea IDÉNTICA a la del motor web: la SPEC pide
// un solo esquema para las cuatro superficies, y si los dos archivos se separan nadie se entera
// hasta que un coach vea el tour dos veces.
//
// GOTCHA de resolucion (mismo que mobile-nutrition-coach-draft-store.test.ts): apps/mobile declara
// su PROPIA dependencia de @react-native-async-storage/async-storage. Un `vi.mock(specifier)` desde
// tests/ NO intercepta el id que resuelve apps/mobile. El fix es resolver el path REAL con
// `require.resolve({ paths: [mobileDir] })` y mockear ESE path absoluto con `vi.doMock` (no
// hoisteado), seguido de un `import()` dinamico.
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', 'apps', 'mobile')

function resolveMobileDep(spec: string): string {
  return requireFromTest.resolve(spec, { paths: [mobileDir] })
}

const store = new Map<string, string>()
/** Cuando es `true`, cada operacion revienta: simula el storage caido / cuota llena. */
let storageBroken = false

function guard<T>(run: () => T): T {
  if (storageBroken) throw new Error('AsyncStorage no disponible')
  return run()
}

const asyncStorageMock = {
  getItem: vi.fn((key: string) =>
    guard(() => Promise.resolve(store.has(key) ? (store.get(key) as string) : null)),
  ),
  setItem: vi.fn((key: string, value: string) =>
    guard(() => {
      store.set(key, value)
      return Promise.resolve()
    }),
  ),
  removeItem: vi.fn((key: string) =>
    guard(() => {
      store.delete(key)
      return Promise.resolve()
    }),
  ),
}

vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({
  default: asyncStorageMock,
}))

const {
  TOUR_FLAG_VERSION,
  clearTourSeen,
  hasSeenTour,
  markTourSeen,
  tourFlagKey,
} = await import('../apps/mobile/components/nutrition-v2/tour/tour-flags')

// El motor web, para el contrato de clave compartida.
const { tourFlagKey: webTourFlagKey, TOUR_FLAG_VERSION: WEB_TOUR_FLAG_VERSION } = await import(
  '../apps/web/src/components/nutrition-v2/tour/tour-flags'
)

const COACH = '11111111-1111-4111-8111-111111111111'
const OTHER_COACH = '22222222-2222-4222-8222-222222222222'

beforeEach(() => {
  store.clear()
  storageBroken = false
  vi.clearAllMocks()
})

afterEach(() => {
  storageBroken = false
})

describe('tourFlagKey', () => {
  it('usa el esquema de la SPEC: eva.tour.<tourId>.<version>.<coachId>', () => {
    expect(tourFlagKey('editor', COACH)).toBe(`eva.tour.editor.v1.${COACH}`)
    expect(TOUR_FLAG_VERSION).toBe('v1')
  })

  it('cae al cajon `anon` sin coach (null, vacio o solo espacios) en vez de escribir `null`', () => {
    expect(tourFlagKey('hub', null)).toBe('eva.tour.hub.v1.anon')
    expect(tourFlagKey('hub', undefined)).toBe('eva.tour.hub.v1.anon')
    expect(tourFlagKey('hub', '')).toBe('eva.tour.hub.v1.anon')
    expect(tourFlagKey('hub', '   ')).toBe('eva.tour.hub.v1.anon')
  })

  it('separa por tour y por coach', () => {
    expect(tourFlagKey('editor', COACH)).not.toBe(tourFlagKey('hub', COACH))
    expect(tourFlagKey('editor', COACH)).not.toBe(tourFlagKey('editor', OTHER_COACH))
  })

  it('lleva la version EN la clave, asi subir a v2 re-arranca sin migrar nada', () => {
    expect(tourFlagKey('editor', COACH)).toContain(`.${TOUR_FLAG_VERSION}.`)
  })
})

describe('contrato de clave con el motor web (SPEC D4: un solo esquema)', () => {
  it('RN y web producen EXACTAMENTE la misma clave para las mismas entradas', () => {
    const cases: Array<[string, string | null | undefined]> = [
      ['editor', COACH],
      ['hub', COACH],
      ['editor', OTHER_COACH],
      ['hub', null],
      ['editor', ''],
    ]
    for (const [tourId, coachId] of cases) {
      expect(tourFlagKey(tourId, coachId)).toBe(webTourFlagKey(tourId, coachId))
    }
  })

  it('las dos plataformas van por la misma version de guion', () => {
    expect(TOUR_FLAG_VERSION).toBe(WEB_TOUR_FLAG_VERSION)
  })
})

describe('hasSeenTour / markTourSeen / clearTourSeen', () => {
  it('sin flag el tour NO se vio (es el caso del auto-arranque)', async () => {
    await expect(hasSeenTour('editor', COACH)).resolves.toBe(false)
  })

  it('marcar deja el tour como visto y no vuelve a insistir', async () => {
    await markTourSeen('editor', COACH)
    await expect(hasSeenTour('editor', COACH)).resolves.toBe(true)
    expect(store.get(`eva.tour.editor.v1.${COACH}`)).toBe('1')
  })

  it('marcar un tour no toca al otro ni a otro coach', async () => {
    await markTourSeen('editor', COACH)
    await expect(hasSeenTour('hub', COACH)).resolves.toBe(false)
    await expect(hasSeenTour('editor', OTHER_COACH)).resolves.toBe(false)
  })

  it('limpiar devuelve el auto-arranque (afordancia de QA, no de producto)', async () => {
    await markTourSeen('hub', COACH)
    await expect(hasSeenTour('hub', COACH)).resolves.toBe(true)
    await clearTourSeen('hub', COACH)
    await expect(hasSeenTour('hub', COACH)).resolves.toBe(false)
  })

  it('un valor extrano guardado a mano no cuenta como visto', async () => {
    store.set(`eva.tour.editor.v1.${COACH}`, 'sarasa')
    await expect(hasSeenTour('editor', COACH)).resolves.toBe(false)
  })
})

describe('degradacion con el storage caido', () => {
  it('hasSeenTour es FAIL-CLOSED: sin memoria, se asume visto (D4: no se insiste)', async () => {
    storageBroken = true
    await expect(hasSeenTour('editor', COACH)).resolves.toBe(true)
  })

  it('markTourSeen no propaga el error: el tour ya se cerro, no hay nada que rescatar', async () => {
    storageBroken = true
    await expect(markTourSeen('editor', COACH)).resolves.toBeUndefined()
  })

  it('clearTourSeen tampoco propaga', async () => {
    storageBroken = true
    await expect(clearTourSeen('editor', COACH)).resolves.toBeUndefined()
  })
})
