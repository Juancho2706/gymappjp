/**
 * W5.T5 (web) — mitad web de la matriz 2×4 «quién llama `startRest`» + toggle de extremo a extremo +
 * CA-80, con **assert de paridad por celda** contra la mitad RN
 * (specs/cuenta-atras-en-pantalla, DATA-TESTING §6.3).
 *
 * Corre en `web-dom` (necesita `localStorage`). La tabla se declara UNA sola vez —en el motor— y acá
 * se afirma que la decisión que toma el camino web es la MISMA que la del camino RN para cada celda:
 * las dos plataformas consultan `resolveRestAfterCommit`, así que la paridad es estructural y este
 * test la congela por si alguien vuelve a escribir la regla a mano en un solo lado.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolveRestAfterCommit, type RestAfterCommitContext } from '@eva/workout-engine'
import { autoRestPrefKey, readAutoRestPref, writeAutoRestPref } from './auto-rest-pref'

// v3 → [planId] → workout → [coach_slug] → c → app → src → web → apps → raíz del repo.
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', '..', '..')
const ORCHESTRATOR_SRC = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/c/[coach_slug]/workout/[planId]/WorkoutExecutionClient.tsx'),
    'utf8',
)
const LOG_SET_FORM_SRC = fs.readFileSync(
    path.join(repoRoot, 'apps/web/src/app/c/[coach_slug]/workout/[planId]/LogSetForm.tsx'),
    'utf8',
)

const CLIENT = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee'

/** La tabla literal de §6.3 W5.T5(a) — la MISMA que usa `tests/mobile/exec-autorest-matrix.test.ts`. */
const MATRIX: Array<{ label: string; context: RestAfterCommitContext; restSec: number; off: string; on: string }> = [
    { label: 'pantalla sola', context: 'solo', restSec: 90, off: 'offer-cta', on: 'auto-start' },
    { label: 'superserie · NO último', context: 'superset-mid', restSec: 90, off: 'none', on: 'none' },
    { label: 'superserie · ÚLTIMO', context: 'superset-last', restSec: 120, off: 'offer-cta', on: 'auto-start' },
    { label: 'sin rest_time', context: 'solo', restSec: 0, off: 'none', on: 'none' },
]

beforeEach(() => {
    localStorage.clear()
})

describe('W5.T5(a) · matriz 2×4 en web, con paridad por celda', () => {
    for (const row of MATRIX) {
        it(`${row.label}: OFF ⇒ ${row.off} · ON ⇒ ${row.on} (idéntico a RN)`, () => {
            const off = resolveRestAfterCommit({ autoRestEnabled: false, context: row.context, restSec: row.restSec })
            const on = resolveRestAfterCommit({ autoRestEnabled: true, context: row.context, restSec: row.restSec })
            expect(off).toBe(row.off)
            expect(on).toBe(row.on)
        })
    }

    it('el ORQUESTADOR web usa el modelo para armar el descanso de ronda (R28/D2)', () => {
        expect(ORCHESTRATOR_SRC).toContain('resolveRestAfterCommit({')
        expect(ORCHESTRATOR_SRC).toContain("context: roundClosed ? 'superset-last' : 'superset-mid',")
        expect(ORCHESTRATOR_SRC).toContain("if (roundRestDecision === 'offer-cta') {")
    })

    it('la verdad de la preferencia vive en el ORQUESTADOR, no en `LogSetForm` (§3.6)', () => {
        // `LogSetForm` consume la prop `autoTimerEnabled` y NO lee storage ni recibe `clientId`.
        expect(LOG_SET_FORM_SRC).not.toContain('omni_autotimer')
        expect(LOG_SET_FORM_SRC).not.toContain('readAutoRestPref')
        expect(ORCHESTRATOR_SRC).toContain('readAutoRestPref({ clientId, hasHistory: !show })')
        // La prop no cambia de nombre (contrato de W5.3).
        expect(ORCHESTRATOR_SRC).toContain('autoTimerEnabled={autoTimerEnabled}')
    })
})

describe('W5.T5(b) · el toggle de la tuerca pega en la serie SIGUIENTE, sin recargar', () => {
    it('ON ⇒ auto-start · apagar ⇒ offer-cta · volver a encender ⇒ auto-start', () => {
        const decide = () =>
            resolveRestAfterCommit({
                autoRestEnabled: readAutoRestPref({ clientId: CLIENT, hasHistory: true }),
                context: 'solo',
                restSec: 90,
            })

        expect(decide()).toBe('auto-start')

        writeAutoRestPref({ clientId: CLIENT, enabled: false })
        expect(decide()).toBe('offer-cta')

        writeAutoRestPref({ clientId: CLIENT, enabled: true })
        expect(decide()).toBe('auto-start')
    })

    it('lo elegido persiste en la clave NUEVA, no en `omni_autotimer`', () => {
        writeAutoRestPref({ clientId: CLIENT, enabled: false })
        expect(localStorage.getItem(autoRestPrefKey(CLIENT))).toBe('0')
        expect(localStorage.getItem('omni_autotimer')).toBeNull()
    })

    it('`toggleAutoTimer` escribe por el carril nuevo y emite el evento W5.9 una sola vez', () => {
        expect(ORCHESTRATOR_SRC).toContain('writeAutoRestPref({ clientId, enabled: newValue })')
        expect(ORCHESTRATOR_SRC).toContain(
            "ph?.capture('rest_autostart_pref_set', { source: 'settings_sheet', enabled: newValue })",
        )
        // Sólo las llamadas REALES (una mención en un comentario no emite nada). Dos emisiones
        // declaradas: la de la tuerca y la del modal de una sola vez.
        const emits = ORCHESTRATOR_SRC.match(/ph\?\.capture\('rest_autostart_pref_set'/g) ?? []
        expect(emits).toHaveLength(2)
        expect(ORCHESTRATOR_SRC).toContain(
            "ph?.capture('rest_autostart_pref_set', { source: 'first_modal', enabled })",
        )
    })
})

describe('W5.T5(c) · CA-80 — con la pref OFF, cerrar una serie NO llama `cancelRest`', () => {
    it('OFF con descanso configurado da `offer-cta`, nunca `none` (no hay rama que cancele)', () => {
        for (const context of ['solo', 'superset-last'] as RestAfterCommitContext[]) {
            expect(resolveRestAfterCommit({ autoRestEnabled: false, context, restSec: 60 })).toBe('offer-cta')
        }
    })

    it('las dos ramas OFF de `LogSetForm` son no-op declarados (W4.6): sin `cancelRest`', () => {
        // Fila de FUERZA (`buildRest`): con la pref apagada se RETORNA antes de tocar el cronómetro.
        expect(LOG_SET_FORM_SRC).toContain('if (!autoTimerEnabled) return')
        // Fila TIPADA: la rama OFF es un bloque vacío con su comentario, sin llamada.
        expect(LOG_SET_FORM_SRC).toMatch(/if \(!autoTimerEnabled\) \{\s*\n(\s*\/\/[^\n]*\n)+\s*\} else if \(supersetRest\)/)
        // Y ningún `cancelRest()` quedó colgando de una condición que mire la preferencia.
        expect(LOG_SET_FORM_SRC).not.toMatch(/!autoTimerEnabled[^\n]*\n?\s*cancelRest\(\)/)
    })

    it('un submit por RELOJ con la pref apagada tampoco arranca ni cancela nada', () => {
        expect(
            resolveRestAfterCommit({ autoRestEnabled: false, context: 'solo', restSec: 90, holdSource: 'timer' }),
        ).toBe('offer-cta')
    })
})
