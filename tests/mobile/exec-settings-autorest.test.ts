/**
 * W5.T4 — la fila «Pasar solo al descanso» de la tuerca RN
 * (specs/cuenta-atras-en-pantalla, DATA-TESTING §6.3).
 *
 * Corre en `mobile-node` (el SDD nombra el archivo `.ts`), así que no monta el sheet: `ExecSettingsSheet`
 * arrastra `Sheet`, reanimated, gesture-handler y lucide, y el valor de este test no está en el pixel
 * sino en el CABLEADO. Se verifica en dos capas, que es lo que puede romperse de verdad:
 *
 *  1. **Estructura** (lectura de la fuente, precedente `tests/mobile/store-copy.test.ts`): la fila del
 *     auto-descanso es **una sola** —dos switches gobernando el mismo `startRest` sería duplicidad
 *     semántica—, conserva `testID="setting-autotimer"` y su toggle escribe por `writeAutoRestPref`,
 *     no por el carril legacy `setRestAutoTimerEnabled`.
 *  2. **Comportamiento**: mover el switch escribe la clave NUEVA `eva:exec-autorest-v1:<clientId>` y
 *     el lector la ve al instante (escritura optimista).
 *
 * ⚠ El COPY de la fila es W5.8 (jefe) y todavía no cambió: acá no se afirma texto a propósito.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const resolveMobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const v3Dir = path.join(mobileDir, 'components', 'alumno', 'workout', 'v3')
const timersDir = path.join(mobileDir, 'components', 'alumno', 'workout', 'timers')

const SHEET_SRC = fs.readFileSync(path.join(v3Dir, 'ExecSettingsSheet.tsx'), 'utf8')

const store = new Map<string, string>()
const asyncStorageMock = {
    getItem: vi.fn((key: string) => Promise.resolve(store.has(key) ? (store.get(key) as string) : null)),
    setItem: vi.fn((key: string, value: string) => {
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
vi.doMock(path.join(timersDir, 'index.ts'), () => import(path.join(timersDir, 'rest-timer-preferences.ts')))

const prefs = await import('../../apps/mobile/components/alumno/workout/v3/auto-rest-pref')

const CLIENT = 'cccccccc-3333-4333-8333-cccccccccccc'

beforeEach(() => {
    store.clear()
    prefs.resetAutoRestPref()
})

describe('W5.T4 · estructura de la fila en `ExecSettingsSheet.tsx`', () => {
    it('hay UNA sola fila de auto-descanso, con `testID="setting-autotimer"`', () => {
        const ids = SHEET_SRC.match(/testID="setting-autotimer"/g) ?? []
        expect(ids).toHaveLength(1)
    })

    it('el toggle escribe por `writeAutoRestPref` (clave por alumno), no por el carril legacy', () => {
        expect(SHEET_SRC).toContain('writeAutoRestPref({ clientId, enabled: v })')
        // `setRestAutoTimerEnabled` ya no se llama desde el sheet: lo decide `auto-rest-pref` según
        // haya o no `clientId` usable. Si volviera acá, la tuerca escribiría en dos carriles distintos.
        expect(SHEET_SRC).not.toContain('setRestAutoTimerEnabled')
    })

    it('el sheet recibe `clientId` como prop nueva y alimenta el estado con el hook reactivo', () => {
        expect(SHEET_SRC).toContain('clientId?: string | null')
        expect(SHEET_SRC).toContain('useAutoRestPref(clientId, autoRestHasHistory)')
        // Nada de `useState(isRestAutoTimerEnabled())`: el estado local desincronizaba la tuerca del
        // ejecutor cuando la preferencia cambiaba desde el modal de una sola vez.
        expect(SHEET_SRC).not.toContain('setAutoTimerState')
    })

    it('el cambio emite `rest_autostart_pref_set` con `source: "settings_sheet"` (W5.9)', () => {
        expect(SHEET_SRC).toContain("captureAppEvent('rest_autostart_pref_set', { source: 'settings_sheet', enabled: v })")
        const emits = SHEET_SRC.match(/rest_autostart_pref_set/g) ?? []
        expect(emits).toHaveLength(1)
    })
})

describe('W5.T4 · el toggle escribe la clave NUEVA y el lector la ve', () => {
    it('encender y apagar deja `\'1\'`/`\'0\'` en `eva:exec-autorest-v1:<clientId>`', async () => {
        await prefs.hydrateAutoRestPref({ clientId: CLIENT })
        // Punto de partida: sin clave y con historial ⇒ ON (lo que vive hoy la base).
        expect(prefs.readAutoRestPref({ clientId: CLIENT, hasHistory: true })).toBe(true)

        prefs.writeAutoRestPref({ clientId: CLIENT, enabled: false })
        expect(store.get(prefs.autoRestPrefKey(CLIENT))).toBe('0')
        expect(prefs.readAutoRestPref({ clientId: CLIENT, hasHistory: true })).toBe(false)

        prefs.writeAutoRestPref({ clientId: CLIENT, enabled: true })
        expect(store.get(prefs.autoRestPrefKey(CLIENT))).toBe('1')
        expect(prefs.readAutoRestPref({ clientId: CLIENT, hasHistory: true })).toBe(true)
    })

    it('la escritura es OPTIMISTA: el lector cambia en el mismo tick, antes de que persista', async () => {
        await prefs.hydrateAutoRestPref({ clientId: CLIENT })
        prefs.writeAutoRestPref({ clientId: CLIENT, enabled: false })
        // Sin `await`: la caché ya cambió.
        expect(prefs.readAutoRestPref({ clientId: CLIENT, hasHistory: true })).toBe(false)
    })

    it('los suscriptores se enteran del cambio (la tuerca y el ejecutor no pueden divergir)', async () => {
        await prefs.hydrateAutoRestPref({ clientId: CLIENT })
        const seen: boolean[] = []
        const off = prefs.subscribeAutoRestPref(() => {
            seen.push(prefs.readAutoRestPref({ clientId: CLIENT, hasHistory: true }))
        })
        prefs.writeAutoRestPref({ clientId: CLIENT, enabled: false })
        prefs.writeAutoRestPref({ clientId: CLIENT, enabled: true })
        off()
        expect(seen).toEqual([false, true])
    })
})
