/**
 * W5.T5(a) — matriz 2×4 «quién arranca el descanso al cerrar la serie», PURA
 * (specs/cuenta-atras-en-pantalla, DATA-TESTING §6.3).
 *
 * Es el modelo contra el que afirman las dos plataformas (`tests/mobile/exec-autorest-matrix.test.ts`
 * y `.../v3/auto-rest-matrix.test.tsx`), así que la tabla se escribe UNA vez acá y allá sólo se
 * compara celda a celda.
 */
import { describe, expect, it } from 'vitest'
import {
    resolveRestAfterCommit,
    type RestAfterCommitContext,
    type RestAfterCommitDecision,
} from './rest-after-commit'

/** La tabla literal de DATA-TESTING §6.3 W5.T5(a). */
export const REST_AFTER_COMMIT_MATRIX: Array<{
    label: string
    context: RestAfterCommitContext
    restSec: number
    off: RestAfterCommitDecision
    on: RestAfterCommitDecision
}> = [
    { label: 'pantalla sola', context: 'solo', restSec: 90, off: 'offer-cta', on: 'auto-start' },
    { label: 'superserie · miembro NO último', context: 'superset-mid', restSec: 90, off: 'none', on: 'none' },
    { label: 'superserie · ÚLTIMO de la ronda', context: 'superset-last', restSec: 90, off: 'offer-cta', on: 'auto-start' },
    { label: 'bloque SIN rest_time', context: 'solo', restSec: 0, off: 'none', on: 'none' },
]

describe('resolveRestAfterCommit — matriz 2×4 (R24 / D2 / A7 / V4)', () => {
    for (const row of REST_AFTER_COMMIT_MATRIX) {
        it(`${row.label} · pref OFF ⇒ ${row.off}`, () => {
            expect(
                resolveRestAfterCommit({ autoRestEnabled: false, context: row.context, restSec: row.restSec }),
            ).toBe(row.off)
        })
        it(`${row.label} · pref ON ⇒ ${row.on}`, () => {
            expect(
                resolveRestAfterCommit({ autoRestEnabled: true, context: row.context, restSec: row.restSec }),
            ).toBe(row.on)
        })
    }

    it('A7 · `rest_time` 0 o negativo ⇒ `none` en TODOS los contextos y con la pref como esté', () => {
        for (const context of ['solo', 'superset-mid', 'superset-last'] as RestAfterCommitContext[]) {
            for (const autoRestEnabled of [true, false]) {
                expect(resolveRestAfterCommit({ autoRestEnabled, context, restSec: 0 })).toBe('none')
                expect(resolveRestAfterCommit({ autoRestEnabled, context, restSec: -5 })).toBe('none')
            }
        }
    })

    it('V4 · entre miembros de la ronda la preferencia NO aplica: siempre `none`', () => {
        expect(resolveRestAfterCommit({ autoRestEnabled: true, context: 'superset-mid', restSec: 120 })).toBe('none')
        expect(resolveRestAfterCommit({ autoRestEnabled: false, context: 'superset-mid', restSec: 120 })).toBe('none')
    })

    it('`holdSource` NO decide: una serie cerrada por el RELOJ da el mismo veredicto que una tocada', () => {
        for (const row of REST_AFTER_COMMIT_MATRIX) {
            for (const autoRestEnabled of [true, false]) {
                const base = resolveRestAfterCommit({ autoRestEnabled, context: row.context, restSec: row.restSec })
                for (const holdSource of [null, 'timer', 'manual']) {
                    expect(
                        resolveRestAfterCommit({ autoRestEnabled, context: row.context, restSec: row.restSec, holdSource }),
                    ).toBe(base)
                }
            }
        }
    })

    it('CA-80 · con la pref OFF y descanso configurado NUNCA sale `none`: no hay rama que cancele nada', () => {
        // El único `cancelRest()` que sobrevive en las dos plataformas está guardado por
        // `decision === 'none' && autoRest`; si OFF pudiera devolver `none` con `restSec > 0`, esa
        // guarda dejaría de proteger el descanso que el alumno arrancó a mano con «Descansar N s».
        for (const context of ['solo', 'superset-last'] as RestAfterCommitContext[]) {
            expect(resolveRestAfterCommit({ autoRestEnabled: false, context, restSec: 60 })).toBe('offer-cta')
        }
    })
})
