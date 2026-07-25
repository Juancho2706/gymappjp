import { describe, it, expect } from 'vitest'
import {
    weekdayNameFromIso,
    doneAttributionLabel,
    buildWorkoutEditHref,
    buildWorkoutRepeatHref,
    buildWorkoutFromDoneHref,
    buildWorkoutRecoverHref,
} from './executor-recovery'

describe('weekdayNameFromIso', () => {
    it('mapea cada día de una semana conocida (2026-07-20 = lunes)', () => {
        expect(weekdayNameFromIso('2026-07-20')).toBe('Lunes')
        expect(weekdayNameFromIso('2026-07-21')).toBe('Martes')
        expect(weekdayNameFromIso('2026-07-22')).toBe('Miércoles')
        expect(weekdayNameFromIso('2026-07-23')).toBe('Jueves')
        expect(weekdayNameFromIso('2026-07-24')).toBe('Viernes')
        expect(weekdayNameFromIso('2026-07-25')).toBe('Sábado')
        expect(weekdayNameFromIso('2026-07-26')).toBe('Domingo')
    })

    it('no sufre corrimiento de TZ en el borde de día (usa mediodía UTC)', () => {
        // 1 de enero 2026 es jueves — un parse naive a medianoche local podría caer al día previo.
        expect(weekdayNameFromIso('2026-01-01')).toBe('Jueves')
    })

    it('devuelve cadena vacía ante formato inválido', () => {
        expect(weekdayNameFromIso('2026-7-1')).toBe('')
        expect(weekdayNameFromIso('nope')).toBe('')
        expect(weekdayNameFromIso('')).toBe('')
    })
})

describe('doneAttributionLabel', () => {
    it('arma "Hecho el {dia}" en minúscula', () => {
        expect(doneAttributionLabel('Jueves')).toBe('Hecho el jueves')
        expect(doneAttributionLabel('Miércoles')).toBe('Hecho el miércoles')
    })
})

describe('builders de URL', () => {
    const base = '/c/mi-coach'
    const planId = 'plan-123'

    it('editar día pasado incluye ?fecha', () => {
        expect(buildWorkoutEditHref(base, planId, '2026-07-21')).toBe('/c/mi-coach/workout/plan-123?fecha=2026-07-21')
    })

    it('repetir hoy no lleva query', () => {
        expect(buildWorkoutRepeatHref(base, planId)).toBe('/c/mi-coach/workout/plan-123')
    })

    it('desde hecho HOY lleva ?desde=hecho', () => {
        expect(buildWorkoutFromDoneHref(base, planId)).toBe('/c/mi-coach/workout/plan-123?desde=hecho')
    })

    it('recuperar pendiente lleva ?recuperar', () => {
        expect(buildWorkoutRecoverHref(base, planId, '2026-07-20')).toBe('/c/mi-coach/workout/plan-123?recuperar=2026-07-20')
    })
})
