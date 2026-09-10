// @vitest-environment jsdom
/**
 * W5.T2 — carril WEB de la preferencia D5 «Pasar solo al descanso»
 * (specs/cuenta-atras-en-pantalla, DATA-TESTING §3.6 / §6.2).
 *
 * `localStorage` es síncrono en web, así que acá no hay caché ni hidratación que probar: lo que se
 * congela son las CLAVES, la codificación `'1'`/`'0'`, la migración de lectura desde `omni_autotimer`,
 * el evento `exec-settings-changed` que sincroniza la tuerca sin recargar, y la regla R32 del
 * `clientId` nulo. La paridad web ↔ RN de las claves se afirma en `tests/mobile/exec-autorest-pref.test.ts`,
 * que importa los DOS módulos.
 *
 * Va en `jsdom` (no en `web-node`) con la directiva de la primera línea, que es la convención del
 * repo para un `.test.ts` que sí necesita DOM (`vitest.config.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    AUTOREST_DEFAULT_STRATEGY,
    AUTOREST_PREF_KEY_PREFIX,
    AUTOREST_SEEN_KEY_PREFIX,
    OMNI_AUTOTIMER_KEY,
    autoRestPrefKey,
    autoRestSeenKey,
    hasSeenAutoRestModal,
    isAutoRestStorageAvailable,
    markAutoRestSeen,
    readAutoRestPref,
    writeAutoRestPref,
} from './auto-rest-pref'
import { EXEC_SETTINGS_EVENT } from './exec-settings'

const CLIENT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const CLIENT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

beforeEach(() => {
    localStorage.clear()
})

describe('W5.T2 · claves y codificación', () => {
    it('los prefijos son los del contrato (espejo exacto de RN)', () => {
        expect(AUTOREST_PREF_KEY_PREFIX).toBe('eva:exec-autorest-v1:')
        expect(AUTOREST_SEEN_KEY_PREFIX).toBe('eva:exec-autorest-seen-v1:')
        expect(autoRestPrefKey(CLIENT_A)).toBe(`eva:exec-autorest-v1:${CLIENT_A}`)
        expect(autoRestSeenKey(CLIENT_A)).toBe(`eva:exec-autorest-seen-v1:${CLIENT_A}`)
    })

    it('la estrategia del default sale del motor y hoy es «cohorte» (R25 / Q1 = A)', () => {
        expect(AUTOREST_DEFAULT_STRATEGY).toBe('cohort')
    })

    it('escribe `\'1\'`/`\'0\'` en la clave nueva y la lee de vuelta', () => {
        writeAutoRestPref({ clientId: CLIENT_A, enabled: true })
        expect(localStorage.getItem(autoRestPrefKey(CLIENT_A))).toBe('1')
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: false })).toBe(true)

        writeAutoRestPref({ clientId: CLIENT_A, enabled: false })
        expect(localStorage.getItem(autoRestPrefKey(CLIENT_A))).toBe('0')
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(false)
    })

    it('aislamiento entre dos alumnos del MISMO navegador', () => {
        writeAutoRestPref({ clientId: CLIENT_A, enabled: false })
        writeAutoRestPref({ clientId: CLIENT_B, enabled: true })
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(false)
        expect(readAutoRestPref({ clientId: CLIENT_B, hasHistory: true })).toBe(true)
    })
})

describe('W5.T2 · migración de lectura desde `omni_autotimer`', () => {
    it('sin clave nueva, el `false` histórico del dispositivo se respeta', () => {
        localStorage.setItem(OMNI_AUTOTIMER_KEY, 'false')
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(false)
        // Migración de LECTURA: la clave nueva no nace sola.
        expect(localStorage.getItem(autoRestPrefKey(CLIENT_A))).toBeNull()
    })

    it('`true` histórico ⇒ ON aunque la cohorte diría OFF', () => {
        localStorage.setItem(OMNI_AUTOTIMER_KEY, 'true')
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: false })).toBe(true)
    })

    it('la clave nueva manda sobre la legacy', () => {
        localStorage.setItem(OMNI_AUTOTIMER_KEY, 'false')
        writeAutoRestPref({ clientId: CLIENT_A, enabled: true })
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(true)
    })

    it('sin ninguna clave manda la cohorte (F5: `hasHistory := !showModal`)', () => {
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(true)
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: false })).toBe(false)
    })
})

describe('W5.T2 · evento `exec-settings-changed` (la tuerca se sincroniza sin recargar)', () => {
    it('cada escritura emite el evento', () => {
        const spy = vi.fn()
        window.addEventListener(EXEC_SETTINGS_EVENT, spy)
        writeAutoRestPref({ clientId: CLIENT_A, enabled: false })
        markAutoRestSeen(CLIENT_A)
        window.removeEventListener(EXEC_SETTINGS_EVENT, spy)
        expect(spy).toHaveBeenCalledTimes(2)
    })
})

describe('W5.T2 · marca «visto»', () => {
    it('arranca en false, se escribe al responder y vive en su propia clave', () => {
        expect(hasSeenAutoRestModal(CLIENT_A)).toBe(false)
        markAutoRestSeen(CLIENT_A)
        expect(localStorage.getItem(autoRestSeenKey(CLIENT_A))).toBe('1')
        expect(hasSeenAutoRestModal(CLIENT_A)).toBe(true)
        // La marca de A no marca a B.
        expect(hasSeenAutoRestModal(CLIENT_B)).toBe(false)
    })
})

describe('W5.T2 · `clientId` nulo ⇒ carril legacy `omni_autotimer` (R32)', () => {
    it('lee Y escribe `omni_autotimer` con `String(boolean)`, sin crear ninguna clave nueva', () => {
        localStorage.setItem(OMNI_AUTOTIMER_KEY, 'false')
        expect(readAutoRestPref({ clientId: null, hasHistory: true })).toBe(false)

        writeAutoRestPref({ clientId: null, enabled: true })
        expect(localStorage.getItem(OMNI_AUTOTIMER_KEY)).toBe('true')
        expect(readAutoRestPref({ clientId: null, hasHistory: true })).toBe(true)

        const keys = Object.keys(localStorage)
        expect(keys.filter((k) => k.startsWith('eva:exec-autorest'))).toEqual([])
    })

    it('un `clientId` que no es uuid se trata como nulo (nunca `…:undefined`)', () => {
        for (const bad of ['', '   ', 'undefined', 'null', '42']) {
            writeAutoRestPref({ clientId: bad, enabled: false })
            expect(hasSeenAutoRestModal(bad)).toBe(true)
            markAutoRestSeen(bad)
        }
        expect(Object.keys(localStorage).filter((k) => k.startsWith('eva:exec-autorest'))).toEqual([])
    })
})

describe('W5.T2 · `isAutoRestStorageAvailable` (T8)', () => {
    it('true con `localStorage` sano', () => {
        expect(isAutoRestStorageAvailable()).toBe(true)
    })

    it('false si el navegador lanza al tocarlo (modo privado / quota / política)', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError')
        })
        expect(isAutoRestStorageAvailable()).toBe(false)
        spy.mockRestore()
    })

    it('con el storage caído, leer NO lanza y devuelve el valor de cohorte (fail-safe)', () => {
        const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })
        expect(() => readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).not.toThrow()
        expect(readAutoRestPref({ clientId: CLIENT_A, hasHistory: true })).toBe(true)
        spy.mockRestore()
    })
})
