/**
 * W5.T3 — carril RN de la preferencia D5 «Pasar solo al descanso»
 * (specs/cuenta-atras-en-pantalla, DATA-TESTING §3.6 / §6.3).
 *
 * Espejo RN de W5.T2 (web) + el assert de **paridad de claves y codificación web ↔ RN**: los dos
 * módulos de plataforma se importan en el MISMO archivo y sus prefijos se comparan. Sin esto, un
 * renombre de un solo lado deja al alumno sin preferencia al pasar del teléfono al navegador y nadie
 * se entera hasta el QA. Precedente del formato: `packages/feature-prefs/feature-prefs.test.ts`.
 *
 * Arnés (mismo que `tests/mobile/offline-queue-hold-source.test.ts`): mock de AsyncStorage con un Map
 * espiable. El barrel `../timers` se sustituye por el módulo REAL `rest-timer-preferences` —lo único
 * que el carril legacy necesita— para no arrastrar `TimerProvider`, `RestTimerBar` y compañía a un
 * entorno node.
 */
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const resolveMobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const timersDir = path.join(mobileDir, 'components', 'alumno', 'workout', 'timers')

const store = new Map<string, string>()
const reads: string[] = []
const writes: string[] = []
const asyncStorageMock = {
    getItem: vi.fn((key: string) => {
        reads.push(key)
        return Promise.resolve(store.has(key) ? (store.get(key) as string) : null)
    }),
    setItem: vi.fn((key: string, value: string) => {
        writes.push(key)
        store.set(key, value)
        return Promise.resolve()
    }),
    removeItem: vi.fn((key: string) => {
        store.delete(key)
        return Promise.resolve()
    }),
    getAllKeys: vi.fn(() => Promise.resolve(Array.from(store.keys()))),
}

vi.doMock(resolveMobileDep('@react-native-async-storage/async-storage'), () => ({ default: asyncStorageMock }))
// El barrel de timers arrastra componentes RN; acá sólo hace falta el carril de preferencias.
vi.doMock(path.join(timersDir, 'index.ts'), () => import(path.join(timersDir, 'rest-timer-preferences.ts')))

const prefs = await import('../../apps/mobile/components/alumno/workout/v3/auto-rest-pref')
const legacy = await import('../../apps/mobile/components/alumno/workout/timers/rest-timer-preferences')
// Paridad de claves: el módulo WEB se importa tal cual (no toca `window` en el scope de módulo).
const webPrefs = await import('../../apps/web/src/app/c/[coach_slug]/workout/[planId]/v3/auto-rest-pref')

const CLIENT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const CLIENT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

beforeEach(() => {
    store.clear()
    reads.length = 0
    writes.length = 0
    prefs.resetAutoRestPref()
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('W5.T3 · paridad de claves y codificación web ↔ RN', () => {
    it('los dos prefijos son byte-idénticos entre plataformas', () => {
        expect(prefs.AUTOREST_PREF_KEY_PREFIX).toBe(webPrefs.AUTOREST_PREF_KEY_PREFIX)
        expect(prefs.AUTOREST_SEEN_KEY_PREFIX).toBe(webPrefs.AUTOREST_SEEN_KEY_PREFIX)
        expect(prefs.AUTOREST_PREF_KEY_PREFIX).toBe('eva:exec-autorest-v1:')
        expect(prefs.AUTOREST_SEEN_KEY_PREFIX).toBe('eva:exec-autorest-seen-v1:')
    })

    it('las claves compuestas también coinciden, alumno por alumno', () => {
        expect(prefs.autoRestPrefKey(CLIENT_A)).toBe(webPrefs.autoRestPrefKey(CLIENT_A))
        expect(prefs.autoRestSeenKey(CLIENT_A)).toBe(webPrefs.autoRestSeenKey(CLIENT_A))
        expect(prefs.autoRestPrefKey(CLIENT_A)).toBe(`eva:exec-autorest-v1:${CLIENT_A}`)
    })

    it('la estrategia del default es la MISMA constante del motor en las dos plataformas (R25)', () => {
        expect(prefs.AUTOREST_DEFAULT_STRATEGY).toBe(webPrefs.AUTOREST_DEFAULT_STRATEGY)
    })

    it('la codificación de la clave nueva es `\'1\'`/`\'0\'`, no `String(boolean)`', async () => {
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        prefs.writeAutoRestPref({ clientId: CLIENT_A, enabled: true })
        expect(store.get(prefs.autoRestPrefKey(CLIENT_A))).toBe('1')
        prefs.writeAutoRestPref({ clientId: CLIENT_A, enabled: false })
        expect(store.get(prefs.autoRestPrefKey(CLIENT_A))).toBe('0')
    })
})

describe('W5.T3 · lectura, escritura y migración', () => {
    it('un valor guardado se lee tal cual, sin importar la cohorte', async () => {
        store.set(prefs.autoRestPrefKey(CLIENT_A), '0')
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(false)
    })

    it('sin clave nueva, `omni_autotimer` migra por LECTURA y NO se copia a disco', async () => {
        store.set('omni_autotimer', 'false')
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(false)
        // La migración es de lectura: nada se escribió (la clave nueva nace recién cuando el alumno elige).
        expect(writes).toHaveLength(0)
        expect(store.has(prefs.autoRestPrefKey(CLIENT_A))).toBe(false)
    })

    it('sin ninguna clave, manda la cohorte: con historial ON, sin historial OFF', async () => {
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(true)
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: false })).toBe(false)
    })

    it('aislamiento entre dos `clientId`: ninguno ve la clave del otro', async () => {
        store.set(prefs.autoRestPrefKey(CLIENT_A), '0')
        store.set(prefs.autoRestPrefKey(CLIENT_B), '1')
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(false)
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_B })
        expect(prefs.readAutoRestPref({ clientId: CLIENT_B, hasHistory: true })).toBe(true)
        // Y escribir para B no toca la clave de A (lección del bug de marca cruzada).
        prefs.writeAutoRestPref({ clientId: CLIENT_B, enabled: false })
        expect(store.get(prefs.autoRestPrefKey(CLIENT_A))).toBe('0')
        expect(store.get(prefs.autoRestPrefKey(CLIENT_B))).toBe('0')
    })

    it('una lectura PRE-hidratación devuelve el comportamiento de hoy (ON) y NO pisa lo guardado', async () => {
        store.set(prefs.autoRestPrefKey(CLIENT_A), '0')
        // Sin hidratar: el OFF del disco todavía no se conoce.
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: false })).toBe(true)
        expect(writes).toHaveLength(0)
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: false })).toBe(false)
        expect(store.get(prefs.autoRestPrefKey(CLIENT_A))).toBe('0')
    })

    it('`hydrateAutoRestPref` es idempotente por `clientId` (dos montajes, una sola lectura)', async () => {
        const p1 = prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        const p2 = prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        expect(p1).toBe(p2)
        await Promise.all([p1, p2])
        expect(reads.filter((k) => k === prefs.autoRestPrefKey(CLIENT_A))).toHaveLength(1)
    })

    it('`resetAutoRestPref` (SIGNED_OUT) limpia la memoria pero NO borra las claves del disco', async () => {
        store.set(prefs.autoRestPrefKey(CLIENT_A), '0')
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(false)
        prefs.resetAutoRestPref()
        expect(prefs.isAutoRestPrefReady(CLIENT_A)).toBe(false)
        expect(prefs.readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(true)
        expect(store.get(prefs.autoRestPrefKey(CLIENT_A))).toBe('0')
    })

    it('la marca «visto» vive en su propia clave y se escribe al RESPONDER, nunca al mostrarse', async () => {
        await prefs.hydrateAutoRestPref({ clientId: CLIENT_A })
        expect(prefs.hasSeenAutoRestModal(CLIENT_A)).toBe(false)
        prefs.markAutoRestSeen(CLIENT_A)
        expect(prefs.hasSeenAutoRestModal(CLIENT_A)).toBe(true)
        expect(store.get(prefs.autoRestSeenKey(CLIENT_A))).toBe('1')
    })
})

describe('W5.T3 · `clientId` nulo ⇒ carril legacy `omni_autotimer` (R32)', () => {
    it('CERO accesos a las claves nuevas, y lee/escribe `omni_autotimer`', async () => {
        // El dispositivo ya tenía la preferencia apagada por el carril viejo: eso se RESPETA.
        store.set('omni_autotimer', 'false')
        await legacy.hydrateRestTimerPrefs()
        reads.length = 0
        writes.length = 0

        expect(prefs.readAutoRestPref({ clientId: null, hasHistory: true })).toBe(false)
        prefs.writeAutoRestPref({ clientId: null, enabled: true })
        expect(prefs.readAutoRestPref({ clientId: null, hasHistory: true })).toBe(true)
        expect(store.get('omni_autotimer')).toBe('true')

        const touched = [...reads, ...writes]
        expect(touched.filter((k) => k.startsWith('eva:exec-autorest'))).toEqual([])
    })

    it('un `clientId` que no es uuid se trata como nulo (nunca `eva:exec-autorest-v1:undefined`)', () => {
        for (const bad of ['', '   ', 'undefined', 'null', '123']) {
            prefs.writeAutoRestPref({ clientId: bad, enabled: false })
        }
        expect([...store.keys()].filter((k) => k.startsWith('eva:exec-autorest'))).toEqual([])
    })

    it('sin `clientId` usable el modal nunca se muestra (`hasSeenAutoRestModal` ⇒ true)', () => {
        expect(prefs.hasSeenAutoRestModal(null)).toBe(true)
        expect(prefs.hasSeenAutoRestModal('undefined')).toBe(true)
        prefs.markAutoRestSeen(null)
        expect([...store.keys()].filter((k) => k.startsWith('eva:exec-autorest'))).toEqual([])
    })
})
