import { describe, it, expect } from 'vitest'
import {
    EMPTY_LOGGED_SET_LABEL,
    formatEsNumber,
    formatLoggedDuration,
    formatLoggedPace,
    formatLoggedSetLine,
    formatStrengthSetLine,
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

describe('formatLoggedPace', () => {
    it('seg/km → "m:ss /km"', () => {
        expect(formatLoggedPace(300)).toBe('5:00 /km')
        expect(formatLoggedPace(322)).toBe('5:22 /km')
        expect(formatLoggedPace(59)).toBe('0:59 /km')
    })
})

describe('formatLoggedSetLine', () => {
    it('cardio: pace derivado entre distancia y conteo/FC (deuda #7 cardio-ejes)', () => {
        expect(
            formatLoggedSetLine('cardio', {
                actual_duration_sec: 1500,
                actual_distance_m: 5000,
                actual_pace_sec_per_km: 300,
                actual_avg_hr: 155,
            }),
        ).toBe('25 min · 5.000 m · 5:00 /km · FC 155')
        expect(formatLoggedSetLine('cardio', { actual_pace_sec_per_km: 322 })).toBe('5:22 /km')
        // Sin pace la línea queda byte-idéntica a la previa (retrocompat).
        expect(
            formatLoggedSetLine('cardio', { actual_duration_sec: 750, actual_distance_m: 3200, actual_avg_hr: 148 }),
        ).toBe('12,5 min · 3.200 m · FC 148')
    })

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

// ── R19 (a) · fuerza por lado ────────────────────────────────────────────────

describe('formatLoggedSetLine: identidad con metadata de lados', () => {
    // El log de fuerza por lado NO cambia ninguna salida de la función existente: `strength` sigue
    // devolviendo `null` (interruptor del render de fuerza de cada superficie) y los tipos tipados
    // ignoran `left_reps`/`right_reps` igual que hoy.
    const sideLog = { weight_kg: 20, reps_done: 10, metadata: { left_reps: 10, right_reps: 12 } }

    it('strength sigue devolviendo null', () => {
        expect(formatLoggedSetLine('strength', sideLog)).toBeNull()
        expect(formatLoggedSetLine('strength', {})).toBeNull()
        expect(formatLoggedSetLine('strength', { reps_done: 10, weight_kg: 20 })).toBeNull()
    })

    it('cardio / movilidad / roller dan lo mismo con y sin los lados de fuerza', () => {
        const base = { actual_duration_sec: 600, actual_distance_m: 3200, actual_hold_sec: 45, reps_done: 3 }
        const withSides = { ...base, metadata: { left_reps: 10, right_reps: 12 } }
        for (const kind of ['cardio', 'mobility', 'roller'] as const) {
            expect(formatLoggedSetLine(kind, withSides)).toBe(formatLoggedSetLine(kind, base))
        }
    })
})

describe('formatStrengthSetLine', () => {
    it('con los dos lados imprime "peso × izq / der"', () => {
        expect(
            formatStrengthSetLine({ weight_kg: 20, reps_done: 10, metadata: { left_reps: 10, right_reps: 10 } }),
        ).toBe('20 kg × 10 / 10')
        expect(
            formatStrengthSetLine({ weight_kg: 22.5, reps_done: 8, metadata: { left_reps: 8, right_reps: 10 } }),
        ).toBe('22,5 kg × 8 / 10')
        // Cadenas de 1 a 4 dígitos: paridad con el `->>` del SQL.
        expect(
            formatStrengthSetLine({ weight_kg: 20, reps_done: 10, metadata: { left_reps: '10', right_reps: '9' } }),
        ).toBe('20 kg × 10 / 9')
    })

    it('sin peso (peso corporal) imprime sólo los lados', () => {
        expect(formatStrengthSetLine({ reps_done: 12, metadata: { left_reps: 12, right_reps: 12 } })).toBe('12 / 12')
        expect(
            formatStrengthSetLine({ weight_kg: 0, reps_done: 12, metadata: { left_reps: 12, right_reps: 12 } }),
        ).toBe('12 / 12')
    })

    it('sin metadata de lados devuelve null (la serie bilateral se pinta como hoy)', () => {
        expect(formatStrengthSetLine({ weight_kg: 20, reps_done: 10 })).toBeNull()
        expect(formatStrengthSetLine({ weight_kg: 20, reps_done: 10, metadata: null })).toBeNull()
        expect(formatStrengthSetLine({ weight_kg: 20, reps_done: 10, metadata: {} })).toBeNull()
        // Un lado solo, un valor inválido o el jsonb de movilidad ⇒ null.
        expect(formatStrengthSetLine({ weight_kg: 20, metadata: { left_reps: 10 } })).toBeNull()
        expect(formatStrengthSetLine({ weight_kg: 20, metadata: { left_reps: 10, right_reps: -1 } })).toBeNull()
        expect(formatStrengthSetLine({ weight_kg: 20, metadata: { left_sec: 30, right_sec: 30 } })).toBeNull()
    })
})
