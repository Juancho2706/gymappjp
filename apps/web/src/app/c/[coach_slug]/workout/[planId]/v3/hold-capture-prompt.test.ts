import { describe, expect, it } from 'vitest'
import { decideHoldCapturePrompt, holdCaptureValuesFromCommit } from './hold-capture-prompt'

/**
 * specs/reps-tras-el-reloj · R3 — la regla ÚNICA de apertura, congelada.
 *
 * Es la mitad web del contrato que RN tiene que cumplir palabra por palabra (matriz de SPEC §5): si
 * un día las dos plataformas dejan de abrir en los mismos casos, este archivo es el que lo detecta.
 */
describe('holdCaptureValuesFromCommit — el payload que se acaba de guardar es la fuente', () => {
    it('`null` en peso o reps se traduce a la cadena vacía (que es lo que el motor cuenta como hueco)', () => {
        expect(holdCaptureValuesFromCommit({ weightKg: null, repsDone: null })).toEqual({ weight: '', reps: '' })
    })

    it('los números viajan tal cual (el `0` de peso corporal es un dato real, no un hueco)', () => {
        expect(holdCaptureValuesFromCommit({ weightKg: 0, repsDone: 8 })).toEqual({ weight: '0', reps: '8' })
    })
})

describe('decideHoldCapturePrompt — las cuatro condiciones de R3 (matriz de SPEC §5)', () => {
    const base = { submit: true, kind: 'strength_time' as const, expiredWhileAway: false }

    it('reloj a 0 con reps vacías y el peso sugerido puesto ⇒ abre con foco en REPS', () => {
        const d = decideHoldCapturePrompt({ ...base, values: { weight: '60', reps: '' } })
        expect(d).toEqual({ open: true, focus: 'reps', missing: ['reps'] })
    })

    it('reps ya tipeadas antes de «Iniciar serie» ⇒ NO abre nada', () => {
        expect(decideHoldCapturePrompt({ ...base, values: { weight: '60', reps: '8' } })).toEqual({ open: false })
    })

    it('sin peso NI reps (bloque sin peso objetivo) ⇒ abre con foco en KG (SPEC §5)', () => {
        const d = decideHoldCapturePrompt({ ...base, values: { weight: '', reps: '' } })
        expect(d).toEqual({ open: true, focus: 'weight', missing: ['reps', 'weight'] })
    })

    it('venció con la pestaña afuera (R6/R27) ⇒ NO abre nada, aunque falten las reps', () => {
        const d = decideHoldCapturePrompt({ ...base, expiredWhileAway: true, values: { weight: '60', reps: '' } })
        expect(d).toEqual({ open: false })
    })

    it('sin envío (pausa, o el lado IZQUIERDO de `per_side`) ⇒ NO abre nada', () => {
        const d = decideHoldCapturePrompt({ ...base, submit: false, values: { weight: '60', reps: '' } })
        expect(d).toEqual({ open: false })
    })

    it('movilidad ⇒ nunca abre (el hold ES el dato)', () => {
        const d = decideHoldCapturePrompt({ ...base, kind: 'mobility', values: { weight: '', reps: '' } })
        expect(d).toEqual({ open: false })
    })

    it('«Listo» antes de 0 con reps vacías igual abre: lo que manda es `submit`, no el motivo', () => {
        const d = decideHoldCapturePrompt({ ...base, values: { weight: '10', reps: '' } })
        expect(d.open).toBe(true)
    })
})
