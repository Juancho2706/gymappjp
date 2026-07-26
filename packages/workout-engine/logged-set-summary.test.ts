import { describe, it, expect } from 'vitest'
import {
    EMPTY_LOGGED_SET_LABEL,
    formatEsNumber,
    formatLoggedDuration,
    formatLoggedSetLine,
    loggedSideSeconds,
} from './logged-set-summary'

describe('formatEsNumber', () => {
    it('agrupa miles con punto y usa coma decimal', () => {
        expect(formatEsNumber(3200)).toBe('3.200')
        expect(formatEsNumber(1000000)).toBe('1.000.000')
        expect(formatEsNumber(12.5, 1)).toBe('12,5')
        expect(formatEsNumber(148)).toBe('148')
    })

    it('recorta decimales en cero', () => {
        expect(formatEsNumber(20, 1)).toBe('20')
        expect(formatEsNumber(1200.04, 1)).toBe('1.200')
    })
})

describe('formatLoggedDuration', () => {
    it('bajo un minuto en segundos, desde un minuto en minutos', () => {
        expect(formatLoggedDuration(45)).toBe('45 s')
        expect(formatLoggedDuration(60)).toBe('1 min')
        expect(formatLoggedDuration(750)).toBe('12,5 min')
        expect(formatLoggedDuration(2700)).toBe('45 min')
    })
})

describe('loggedSideSeconds', () => {
    it('lee {left_sec,right_sec} y descarta cualquier otra forma', () => {
        expect(loggedSideSeconds({ left_sec: 30, right_sec: 25 })).toEqual({ left: 30, right: 25 })
        expect(loggedSideSeconds({ left_sec: 30, right_sec: null })).toEqual({ left: 30, right: null })
        expect(loggedSideSeconds({ left_sec: 0, right_sec: 0 })).toBeNull()
        expect(loggedSideSeconds(null)).toBeNull()
        expect(loggedSideSeconds('30')).toBeNull()
        expect(loggedSideSeconds([{ left_sec: 30 }])).toBeNull()
    })
})

describe('formatLoggedSetLine', () => {
    it('cardio: tiempo · distancia · FC, solo las partes con dato', () => {
        expect(
            formatLoggedSetLine('cardio', {
                actual_duration_sec: 750,
                actual_distance_m: 3200,
                actual_avg_hr: 148,
            }),
        ).toBe('12,5 min · 3.200 m · FC 148')
        expect(formatLoggedSetLine('cardio', { actual_distance_m: 6200 })).toBe('6.200 m')
        expect(formatLoggedSetLine('cardio', { actual_avg_hr: 132 })).toBe('FC 132')
    })

    it('cardio: ronda cerrada vacía (decisión D3) ⇒ etiqueta discreta', () => {
        expect(formatLoggedSetLine('cardio', {})).toBe(EMPTY_LOGGED_SET_LABEL)
        expect(
            formatLoggedSetLine('cardio', {
                actual_duration_sec: null,
                actual_distance_m: null,
                actual_avg_hr: null,
            }),
        ).toBe(EMPTY_LOGGED_SET_LABEL)
    })

    it('movilidad: hold total, por lado simétrico y por lado asimétrico', () => {
        expect(formatLoggedSetLine('mobility', { actual_hold_sec: 45 })).toBe('45 s')
        expect(
            formatLoggedSetLine('mobility', { actual_hold_sec: 60, metadata: { left_sec: 30, right_sec: 30 } }),
        ).toBe('30 s por lado')
        expect(
            formatLoggedSetLine('mobility', { actual_hold_sec: 55, metadata: { left_sec: 30, right_sec: 25 } }),
        ).toBe('Izq. 30 s · Der. 25 s')
        expect(formatLoggedSetLine('mobility', { metadata: { left_sec: null, right_sec: 25 } })).toBe('Der. 25 s')
        expect(formatLoggedSetLine('mobility', {})).toBe(EMPTY_LOGGED_SET_LABEL)
    })

    it('roller: duración y/o pasadas, con singular correcto', () => {
        expect(formatLoggedSetLine('roller', { actual_duration_sec: 45, reps_done: 3 })).toBe('45 s · 3 pasadas')
        expect(formatLoggedSetLine('roller', { reps_done: 1 })).toBe('1 pasada')
        expect(formatLoggedSetLine('roller', {})).toBe(EMPTY_LOGGED_SET_LABEL)
    })

    it('fuerza: null ⇒ el caller mantiene su fila peso × reps intacta', () => {
        expect(formatLoggedSetLine('strength', { actual_duration_sec: 750 })).toBeNull()
    })
})

// ── Conteo de cardio con la etiqueta de la MODALIDAD (Fase C) ──
describe('formatLoggedSetLine — cardio rep-based', () => {
    it('imprime saltos / pisos / reps según la modalidad del ejercicio', () => {
        expect(
            formatLoggedSetLine('cardio', { actual_duration_sec: 480, reps_done: 420, actual_avg_hr: 152 }, {
                cardioModality: 'jump_rope',
            }),
        ).toBe('8 min · 420 saltos · FC 152')
        expect(
            formatLoggedSetLine('cardio', { actual_duration_sec: 720, reps_done: 45 }, { cardioModality: 'stairs' }),
        ).toBe('12 min · 45 pisos')
        expect(
            formatLoggedSetLine('cardio', { actual_duration_sec: 600, reps_done: 30 }, { cardioModality: 'hiit_reps' }),
        ).toBe('10 min · 30 reps')
    })

    it('sin modalidad (o desconocida) un conteo en cardio se imprime genérico', () => {
        expect(formatLoggedSetLine('cardio', { actual_duration_sec: 600, reps_done: 30 })).toBe('10 min · 30 reps')
        expect(formatLoggedSetLine('cardio', { reps_done: 1 }, { cardioModality: 'jump_rope' })).toBe('1 salto')
        expect(formatLoggedSetLine('cardio', { reps_done: 12 }, { cardioModality: 'swim' })).toBe('12 reps')
    })

    it('sin conteo la línea no cambia; el 3er argumento es opcional y no altera nada más', () => {
        const log = { actual_duration_sec: 750, actual_distance_m: 3200, actual_avg_hr: 148 }
        expect(formatLoggedSetLine('cardio', log, { cardioModality: 'run' })).toBe('12,5 min · 3.200 m · FC 148')
        expect(formatLoggedSetLine('cardio', log, { cardioModality: 'run' })).toBe(formatLoggedSetLine('cardio', log))
        expect(formatLoggedSetLine('cardio', {}, { cardioModality: 'stairs' })).toBe(EMPTY_LOGGED_SET_LABEL)
        // Movilidad y roller ignoran la modalidad (roller sigue con "pasadas").
        expect(formatLoggedSetLine('roller', { reps_done: 3 }, { cardioModality: 'jump_rope' })).toBe('3 pasadas')
        expect(formatLoggedSetLine('mobility', { actual_hold_sec: 45 }, { cardioModality: 'stairs' })).toBe('45 s')
    })
})
