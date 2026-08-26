/**
 * «Ver como {demo}»: explicar UNA vez antes de saltar al navegador
 * (`apps/mobile/lib/vive-tu-app.ts`, hallazgo 4 del QA del owner 2026-08-22).
 *
 * Lo que se pinnea:
 *  - el aviso dice las cuatro cosas que el coach necesita saber (se abre en el navegador · con SU
 *    marca · su sesión de coach sigue viva · cómo vuelve) y nombra al demo en el título y en el
 *    botón. La vuelta se pinnea con el literal exacto del banner web («Volver a la app», SPEC
 *    «Vive tu app» directo §3): dos copys que se contradicen mandan a buscar un botón que no está;
 *  - se explica UNA sola vez por coach: el segundo toque abre directo;
 *  - cancelar NO abre nada y se distingue de un error (la guía no puede toastear «no se pudo»
 *    cuando el coach simplemente cerró el aviso);
 *  - sin `coachId` se explica igual pero no se sella contra una clave que no identifica a nadie;
 *  - un AsyncStorage que falla degrada a «explicar de nuevo», nunca a «no abrir».
 *
 * GOTCHA de resolución (mismo patrón que `coach-persona.test.ts`, un paso más): el módulo arrastra
 * react-native y AsyncStorage. En este monorepo pnpm la raíz tiene su PROPIA copia de
 * `react-native` (`node_modules/react-native` es un directorio real, no un symlink a la de mobile),
 * así que `vi.doMock('react-native')` desde `tests/` mockea OTRO módulo y el de verdad —Flow sin
 * transpilar— revienta el parser. Por eso acá todo se mockea por PATH ABSOLUTO: los módulos del app
 * desde `apps/mobile/lib` y los paquetes nativos desde `apps/mobile/node_modules`.
 */
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const mobileLib = (name: string) => path.resolve(mobileDir, 'lib', name)
const mobilePkg = (name: string) => path.resolve(mobileDir, 'node_modules', name)

let openedUrls: string[] = []
let apiImpl: () => Promise<unknown>

async function loadModule() {
    vi.resetModules()
    vi.doMock(mobilePkg('react-native'), () => ({
        Alert: { alert: () => undefined },
        Linking: {
            openURL: async (url: string) => {
                openedUrls.push(url)
            },
        },
    }))
    vi.doMock(mobilePkg('@react-native-async-storage/async-storage'), () => ({
        default: { getItem: async () => null, setItem: async () => undefined },
    }))
    vi.doMock(mobileLib('api'), () => ({
        ApiError: class ApiError extends Error {},
        apiFetch: () => apiImpl(),
    }))
    vi.doMock(mobileLib('store-compliance'), () => ({ isStoreSafeUrl: () => true }))
    return import(mobileLib('vive-tu-app'))
}

/** Almacén en memoria: el sello «ya se lo expliqué», sin AsyncStorage. */
function memoryStore(seed: Record<string, string> = {}) {
    const map = new Map(Object.entries(seed))
    return {
        map,
        getItem: async (key: string) => map.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            map.set(key, value)
        },
    }
}

beforeEach(() => {
    openedUrls = []
    apiImpl = async () => ({ ok: true, url: 'https://www.eva-app.cl/vive-tu-app?t=x', demoName: 'Matías Soto' })
})

describe('viveTuAppExplainer', () => {
    it('nombra al demo y explica navegador, marca, sesión y vuelta', async () => {
        const { viveTuAppExplainer } = await loadModule()
        const copy = viveTuAppExplainer({ demoName: 'Matías', noun: 'alumno' })
        expect(copy.title).toBe('Así la ve Matías')
        expect(copy.confirmLabel).toBe('Abrir como Matías')
        expect(copy.cancelLabel).toBe('Cancelar')
        expect(copy.message).toContain('navegador')
        expect(copy.message).toContain('tu logo y tu color')
        expect(copy.message).toContain('Tu sesión de coach sigue acá en la app')
        expect(copy.message).toContain('tu alumno')
        // v2: la salida buena es el botón del banner; el atrás queda como segunda vía (desde el
        // builder el banner no ofrece deep link y es la única).
        expect(copy.message).toContain('toca «Volver a la app»')
        expect(copy.message).toContain('el botón atrás')
    })

    it('el copy no vende: sin plan, sin precio, sin dominio', async () => {
        const { viveTuAppExplainer } = await loadModule()
        const copy = viveTuAppExplainer({ demoName: 'Matías', noun: 'alumno' })
        const all = `${copy.title} ${copy.message} ${copy.cancelLabel} ${copy.confirmLabel}`
        expect(all).not.toMatch(/plan|precio|\$|eva-app\.cl|Pro\b/i)
    })

    it('usa el sustantivo de la persona del coach', async () => {
        const { viveTuAppExplainer } = await loadModule()
        expect(viveTuAppExplainer({ demoName: 'Ana', noun: 'paciente' }).message).toContain('tu paciente')
    })

    it('sin nombre de demo no deja un hueco en el copy', async () => {
        const { viveTuAppExplainer } = await loadModule()
        const copy = viveTuAppExplainer({ demoName: '  ', noun: '' })
        expect(copy.title).toBe('Así la ve tu alumno de ejemplo')
        expect(copy.confirmLabel).toBe('Abrir como tu alumno de ejemplo')
        expect(copy.message).toContain('tu alumno')
    })
})

describe('shouldExplainViveTuApp / viveTuAppExplainedKey', () => {
    it('solo el sello exacto apaga el aviso', async () => {
        const { shouldExplainViveTuApp } = await loadModule()
        expect(shouldExplainViveTuApp(null)).toBe(true)
        expect(shouldExplainViveTuApp(undefined)).toBe(true)
        expect(shouldExplainViveTuApp('')).toBe(true)
        expect(shouldExplainViveTuApp('1')).toBe(true)
        expect(shouldExplainViveTuApp('true')).toBe(false)
    })

    it('la clave es por coach y versionada', async () => {
        const { viveTuAppExplainedKey } = await loadModule()
        expect(viveTuAppExplainedKey('coach-a')).toBe('eva.vive-tu-app.explained.v2:coach-a')
        expect(viveTuAppExplainedKey('coach-b')).not.toBe(viveTuAppExplainedKey('coach-a'))
    })

    it('el sello v1 no apaga el aviso v2: el copy cambió de fondo y hay que re-explicarlo', async () => {
        const { openViveTuAppGuided } = await loadModule()
        const store = memoryStore({ 'eva.vive-tu-app.explained.v1:coach-a': 'true' })
        let asked = 0
        await openViveTuAppGuided({
            coachId: 'coach-a',
            demoName: 'Matías',
            noun: 'alumno',
            store,
            confirm: async () => {
                asked += 1
                return true
            },
        })
        expect(asked).toBe(1)
    })
})

describe('openViveTuAppGuided', () => {
    it('la primera vez explica, y al aceptar abre y sella', async () => {
        const { openViveTuAppGuided, viveTuAppExplainedKey } = await loadModule()
        const store = memoryStore()
        const seen: string[] = []
        const outcome = await openViveTuAppGuided({
            coachId: 'coach-a',
            demoName: 'Matías',
            noun: 'alumno',
            store,
            confirm: async (copy) => {
                seen.push(copy.title)
                return true
            },
        })
        expect(seen).toEqual(['Así la ve Matías'])
        expect(outcome).toEqual({ status: 'opened', demoName: 'Matías Soto' })
        expect(openedUrls).toHaveLength(1)
        expect(store.map.get(viveTuAppExplainedKey('coach-a'))).toBe('true')
    })

    it('la segunda vez abre directo, sin aviso', async () => {
        const { openViveTuAppGuided, viveTuAppExplainedKey } = await loadModule()
        const store = memoryStore({ [viveTuAppExplainedKey('coach-a')]: 'true' })
        let asked = 0
        const outcome = await openViveTuAppGuided({
            coachId: 'coach-a',
            demoName: 'Matías',
            noun: 'alumno',
            store,
            confirm: async () => {
                asked += 1
                return true
            },
        })
        expect(asked).toBe(0)
        expect(outcome.status).toBe('opened')
        expect(openedUrls).toHaveLength(1)
    })

    it('el sello es por coach: otro coach vuelve a ver el aviso', async () => {
        const { openViveTuAppGuided, viveTuAppExplainedKey } = await loadModule()
        const store = memoryStore({ [viveTuAppExplainedKey('coach-a')]: 'true' })
        let asked = 0
        await openViveTuAppGuided({
            coachId: 'coach-b',
            demoName: 'Matías',
            noun: 'alumno',
            store,
            confirm: async () => {
                asked += 1
                return true
            },
        })
        expect(asked).toBe(1)
    })

    it('cancelar no abre nada, no sella y NO es un error', async () => {
        const { openViveTuAppGuided, viveTuAppExplainedKey } = await loadModule()
        const store = memoryStore()
        const outcome = await openViveTuAppGuided({
            coachId: 'coach-a',
            demoName: 'Matías',
            noun: 'alumno',
            store,
            confirm: async () => false,
        })
        expect(outcome).toEqual({ status: 'cancelled' })
        expect(openedUrls).toEqual([])
        expect(store.map.get(viveTuAppExplainedKey('coach-a'))).toBeUndefined()
    })

    it('sin coachId explica igual, abre y no sella nada', async () => {
        const { openViveTuAppGuided } = await loadModule()
        const store = memoryStore()
        let asked = 0
        const outcome = await openViveTuAppGuided({
            coachId: null,
            demoName: 'Matías',
            noun: 'alumno',
            store,
            confirm: async () => {
                asked += 1
                return true
            },
        })
        expect(asked).toBe(1)
        expect(outcome.status).toBe('opened')
        expect(store.map.size).toBe(0)
    })

    it('un almacén roto degrada a explicar de nuevo, nunca a no abrir', async () => {
        const { openViveTuAppGuided } = await loadModule()
        const store = {
            getItem: async () => {
                throw new Error('AsyncStorage caido')
            },
            setItem: async () => {
                throw new Error('AsyncStorage caido')
            },
        }
        let asked = 0
        const outcome = await openViveTuAppGuided({
            coachId: 'coach-a',
            demoName: 'Matías',
            noun: 'alumno',
            store,
            confirm: async () => {
                asked += 1
                return true
            },
        })
        expect(asked).toBe(1)
        expect(outcome.status).toBe('opened')
    })

    it('un fallo real del servidor sí llega como error para toastear', async () => {
        const { openViveTuAppGuided } = await loadModule()
        apiImpl = async () => {
            throw new Error('boom')
        }
        const outcome = await openViveTuAppGuided({
            coachId: 'coach-a',
            demoName: 'Matías',
            noun: 'alumno',
            store: memoryStore(),
            confirm: async () => true,
        })
        expect(outcome.status).toBe('error')
        expect(openedUrls).toEqual([])
    })
})
