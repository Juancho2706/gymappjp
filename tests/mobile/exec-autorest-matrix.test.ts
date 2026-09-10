/**
 * W5.T5 (RN) — matriz 2×4 «quién llama `startRest`» + toggle de extremo a extremo + CA-80
 * (specs/cuenta-atras-en-pantalla, DATA-TESTING §6.3).
 *
 * Los tres bloques del test:
 *  (a) **Matriz 2×4** contra el modelo puro `resolveRestAfterCommit`, que es EL que `ExecutorV3`
 *      consulta en las dos ramas de `maybeStartRest` (superserie y bloque suelto). La tabla vive una
 *      sola vez en el motor; acá se afirma que el orquestador la usa y no reimplementa nada.
 *  (b) **Toggle de extremo a extremo** con el store real: partir en ON ⇒ `auto-start`; apagar el
 *      switch **sin recargar** ⇒ `offer-cta` en la serie SIGUIENTE; volver a encender ⇒ `auto-start`.
 *  (c) **CA-80**: con la pref OFF, cerrar una serie no puede llamar `cancelRest`. Se prueba por el
 *      modelo (OFF con descanso configurado nunca da `none`, que es la única guarda que sobrevive) y
 *      por la FUENTE de `ExecutorV3`, donde todo `timers.cancelRest()` del camino de commit quedó
 *      detrás de `decision === 'none' && autoRest`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRestAfterCommit, type RestAfterCommitContext } from '@eva/workout-engine'

const requireFromTest = createRequire(import.meta.url)
const mobileDir = path.resolve(__dirname, '..', '..', 'apps', 'mobile')
const resolveMobileDep = (spec: string) => requireFromTest.resolve(spec, { paths: [mobileDir] })
const v3Dir = path.join(mobileDir, 'components', 'alumno', 'workout', 'v3')
const timersDir = path.join(mobileDir, 'components', 'alumno', 'workout', 'timers')

const EXECUTOR_SRC = fs.readFileSync(path.join(v3Dir, 'ExecutorV3.tsx'), 'utf8')

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

const CLIENT = 'dddddddd-4444-4444-8444-dddddddddddd'

/** La tabla literal de §6.3 W5.T5(a). `none` = nadie llama `startRest`, ni automático ni CTA. */
const MATRIX: Array<{ label: string; context: RestAfterCommitContext; restSec: number; off: string; on: string }> = [
    { label: 'pantalla sola', context: 'solo', restSec: 90, off: 'offer-cta', on: 'auto-start' },
    { label: 'superserie · NO último', context: 'superset-mid', restSec: 90, off: 'none', on: 'none' },
    { label: 'superserie · ÚLTIMO', context: 'superset-last', restSec: 120, off: 'offer-cta', on: 'auto-start' },
    { label: 'sin rest_time', context: 'solo', restSec: 0, off: 'none', on: 'none' },
]

beforeEach(() => {
    store.clear()
    prefs.resetAutoRestPref()
})

describe('W5.T5(a) · matriz 2×4 en RN', () => {
    for (const row of MATRIX) {
        it(`${row.label}: OFF ⇒ ${row.off} · ON ⇒ ${row.on}`, () => {
            expect(resolveRestAfterCommit({ autoRestEnabled: false, context: row.context, restSec: row.restSec })).toBe(row.off)
            expect(resolveRestAfterCommit({ autoRestEnabled: true, context: row.context, restSec: row.restSec })).toBe(row.on)
        })
    }

    it('`ExecutorV3` consulta el modelo en las DOS ramas de `maybeStartRest` (no reimplementa la tabla)', () => {
        const calls = EXECUTOR_SRC.match(/resolveRestAfterCommit\(\{/g) ?? []
        expect(calls).toHaveLength(2)
        // Superserie: el contexto se deriva de si la ronda cerró (V4 vs D2).
        expect(EXECUTOR_SRC).toContain("context: roundClosed ? 'superset-last' : 'superset-mid',")
        // Bloque suelto.
        expect(EXECUTOR_SRC).toContain("context: 'solo',")
    })

    it('la preferencia se lee SÍNCRONA por alumno, no por el carril legacy (R36 + R32)', () => {
        expect(EXECUTOR_SRC).toContain('readAutoRestPref({ clientId, hasHistory: autoRestHasHistoryRef.current })')
        expect(EXECUTOR_SRC).not.toContain('isRestAutoTimerEnabled')
    })
})

describe('W5.T5(b) · el toggle de la tuerca pega en la serie SIGUIENTE, sin recargar', () => {
    it('ON ⇒ auto-start · apagar ⇒ offer-cta · volver a encender ⇒ auto-start', async () => {
        await prefs.hydrateAutoRestPref({ clientId: CLIENT })
        const decide = () =>
            resolveRestAfterCommit({
                autoRestEnabled: prefs.readAutoRestPref({ clientId: CLIENT, hasHistory: true }),
                context: 'solo',
                restSec: 90,
            })

        expect(decide()).toBe('auto-start')

        prefs.writeAutoRestPref({ clientId: CLIENT, enabled: false })
        expect(decide()).toBe('offer-cta')

        prefs.writeAutoRestPref({ clientId: CLIENT, enabled: true })
        expect(decide()).toBe('auto-start')
    })

    it('el cambio queda persistido para la sesión siguiente (clave nueva, no `omni_autotimer`)', async () => {
        await prefs.hydrateAutoRestPref({ clientId: CLIENT })
        prefs.writeAutoRestPref({ clientId: CLIENT, enabled: false })
        expect(store.get(prefs.autoRestPrefKey(CLIENT))).toBe('0')
        expect(store.has('omni_autotimer')).toBe(false)

        // Sesión nueva: se resetea la memoria y se vuelve a hidratar del disco.
        prefs.resetAutoRestPref()
        await prefs.hydrateAutoRestPref({ clientId: CLIENT })
        expect(prefs.readAutoRestPref({ clientId: CLIENT, hasHistory: true })).toBe(false)
    })
})

describe('W5.T5(c) · CA-80 — con la pref OFF, cerrar una serie NO cancela el descanso en curso', () => {
    it('OFF con descanso configurado nunca devuelve `none`: la guarda del `cancelRest` no puede dispararse', () => {
        for (const context of ['solo', 'superset-last'] as RestAfterCommitContext[]) {
            expect(resolveRestAfterCommit({ autoRestEnabled: false, context, restSec: 60 })).toBe('offer-cta')
        }
    })

    it('todo `timers.cancelRest()` del camino de commit quedó detrás de `decision === \'none\' && autoRest`', () => {
        // 3 ocurrencias en el archivo: 2 en `maybeStartRest` (guardadas) y 1 al OMITIR un bloque, que
        // no es cierre de serie y no está gobernada por la preferencia.
        // Sólo llamadas REALES: la línea tiene que empezar con la sentencia (un `timers.cancelRest()`
        // citado dentro de un comentario no cuenta).
        const all = EXECUTOR_SRC.match(/^\s*timers\.cancelRest\(\)$/gm) ?? []
        expect(all).toHaveLength(3)
        const guarded = EXECUTOR_SRC.match(/decision === 'none' && autoRest/g) ?? []
        expect(guarded).toHaveLength(2)
        // La rama OFF de antes (`if (!autoRest) { timers.cancelRest() }`) ya no existe.
        expect(EXECUTOR_SRC).not.toMatch(/if \(!autoRest\)\s*\{\s*\n?\s*timers\.cancelRest\(\)/)
    })

    it('un submit disparado por el RELOJ con la pref apagada tampoco arranca ni cancela nada', () => {
        expect(
            resolveRestAfterCommit({ autoRestEnabled: false, context: 'solo', restSec: 90, holdSource: 'timer' }),
        ).toBe('offer-cta')
        expect(
            resolveRestAfterCommit({ autoRestEnabled: false, context: 'superset-last', restSec: 90, holdSource: 'timer' }),
        ).toBe('offer-cta')
    })
})
