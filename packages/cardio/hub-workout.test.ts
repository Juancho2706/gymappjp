import { describe, expect, it } from 'vitest'

import {
    HUB_HR_MAX_BPM,
    HUB_HR_MIN_BPM,
    hubImportPatch,
    hubZoneSec,
    matchHubWorkoutToWindow,
    type HubWorkout,
} from './hub-workout'
import type { HrToZoneProfile } from './zones'

/** Mismo perfil de referencia que zone-session: FCmax 200 ⇒ Z1 100-120 · Z2 120-140 · Z3 140-160 · Z4 160-180 · Z5 180-200. */
const PROFILE: HrToZoneProfile = { max_hr: 200, resting_hr: null }

const T0 = 1_700_000_000_000
const MIN = 60_000

function workout(overrides: Partial<HubWorkout> & Pick<HubWorkout, 'id' | 'startMs' | 'endMs'>): HubWorkout {
    return {
        source: 'Apple Watch',
        activity: 'running',
        durationSec: Math.max(0, Math.round((overrides.endMs - overrides.startMs) / 1000)),
        distanceM: null,
        calories: null,
        avgHr: null,
        maxHr: null,
        hrSamples: null,
        ...overrides,
    }
}

const EMPTY_AXES = { actual_duration_sec: null, actual_distance_m: null, actual_avg_hr: null }

describe('matchHubWorkoutToWindow', () => {
    // Ventana de sesion: 10:00 a 10:45.
    const winStart = T0
    const winEnd = T0 + 45 * MIN

    it('sin workouts devuelve null (estado vacio honesto, no se importa nada)', () => {
        expect(matchHubWorkoutToWindow([], winStart, winEnd)).toBeNull()
    })

    it('elige el workout contenido en la ventana', () => {
        const w = workout({ id: 'a', startMs: T0 + 5 * MIN, endMs: T0 + 35 * MIN })
        expect(matchHubWorkoutToWindow([w], winStart, winEnd)?.id).toBe('a')
    })

    it('descarta el que solapa menos del 50% de SU duracion', () => {
        // Caminata de 40 min que pilla solo los ultimos 5 min de la ventana ⇒ 12,5%.
        const paseo = workout({ id: 'paseo', startMs: T0 + 40 * MIN, endMs: T0 + 80 * MIN })
        expect(matchHubWorkoutToWindow([paseo], winStart, winEnd)).toBeNull()
    })

    it('acepta exactamente el 50% de solape (borde incluido)', () => {
        // 30 min de workout, 15 dentro de la ventana.
        const w = workout({ id: 'borde', startMs: T0 + 30 * MIN, endMs: T0 + 60 * MIN })
        expect(matchHubWorkoutToWindow([w], winStart, winEnd)?.id).toBe('borde')
    })

    it('gana el de mayor solape absoluto', () => {
        const corto = workout({ id: 'corto', startMs: T0 + 5 * MIN, endMs: T0 + 15 * MIN })
        const largo = workout({ id: 'largo', startMs: T0 + 5 * MIN, endMs: T0 + 40 * MIN })
        expect(matchHubWorkoutToWindow([corto, largo], winStart, winEnd)?.id).toBe('largo')
        expect(matchHubWorkoutToWindow([largo, corto], winStart, winEnd)?.id).toBe('largo')
    })

    it('empate de solape ⇒ gana el mas largo', () => {
        // Ambos aportan 20 min de solape; el segundo dura 40 min (20 dentro + 20 fuera).
        const justo = workout({ id: 'justo', startMs: T0 + 5 * MIN, endMs: T0 + 25 * MIN })
        const desbordado = workout({ id: 'desbordado', startMs: T0 + 25 * MIN, endMs: T0 + 65 * MIN })
        expect(matchHubWorkoutToWindow([justo, desbordado], winStart, winEnd)?.id).toBe('desbordado')
        expect(matchHubWorkoutToWindow([desbordado, justo], winStart, winEnd)?.id).toBe('desbordado')
    })

    it('empate total ⇒ estable, gana el primero de la lista', () => {
        const a = workout({ id: 'a', startMs: T0 + 5 * MIN, endMs: T0 + 25 * MIN })
        const b = workout({ id: 'b', startMs: T0 + 5 * MIN, endMs: T0 + 25 * MIN })
        expect(matchHubWorkoutToWindow([a, b], winStart, winEnd)?.id).toBe('a')
        expect(matchHubWorkoutToWindow([b, a], winStart, winEnd)?.id).toBe('b')
    })

    it('workout completamente fuera de la ventana no califica', () => {
        const ayer = workout({ id: 'ayer', startMs: T0 - 300 * MIN, endMs: T0 - 240 * MIN })
        const pegado = workout({ id: 'pegado', startMs: T0 + 45 * MIN, endMs: T0 + 60 * MIN })
        expect(matchHubWorkoutToWindow([ayer, pegado], winStart, winEnd)).toBeNull()
    })

    it('descarta rangos degenerados del hub (fin <= inicio) en vez de dividir por cero', () => {
        const roto = workout({ id: 'roto', startMs: T0 + 5 * MIN, endMs: T0 + 5 * MIN, durationSec: 1800 })
        const invertido = workout({ id: 'invertido', startMs: T0 + 20 * MIN, endMs: T0 + 5 * MIN, durationSec: 900 })
        expect(matchHubWorkoutToWindow([roto, invertido], winStart, winEnd)).toBeNull()
    })

    it('ventana invalida (fin <= inicio o no finita) devuelve null', () => {
        const w = workout({ id: 'a', startMs: T0 + 5 * MIN, endMs: T0 + 35 * MIN })
        expect(matchHubWorkoutToWindow([w], winEnd, winStart)).toBeNull()
        expect(matchHubWorkoutToWindow([w], winStart, winStart)).toBeNull()
        expect(matchHubWorkoutToWindow([w], Number.NaN, winEnd)).toBeNull()
    })
})

describe('hubImportPatch', () => {
    const w = workout({
        id: 'w',
        startMs: T0,
        endMs: T0 + 30 * MIN,
        durationSec: 1800,
        distanceM: 5234.6,
        calories: 320,
        avgHr: 147.4,
        maxHr: 178,
    })

    it('con todos los ejes vacios rellena los tres', () => {
        expect(hubImportPatch(w, EMPTY_AXES)).toEqual({
            actual_duration_sec: 1800,
            actual_distance_m: 5235,
            actual_avg_hr: 147,
        })
    })

    it('JAMAS pisa un eje ya tipeado por el alumno', () => {
        expect(hubImportPatch(w, { actual_duration_sec: 1500, actual_distance_m: 4000, actual_avg_hr: 152 })).toEqual({})
    })

    it('rellena solo los huecos y deja intacto lo tipeado', () => {
        const patch = hubImportPatch(w, {
            actual_duration_sec: 1500,
            actual_distance_m: null,
            actual_avg_hr: null,
        })
        expect(patch).not.toHaveProperty('actual_duration_sec')
        expect(patch).toEqual({ actual_distance_m: 5235, actual_avg_hr: 147 })
    })

    it('un 0 guardado cuenta como eje vacio', () => {
        expect(hubImportPatch(w, { actual_duration_sec: 0, actual_distance_m: 0, actual_avg_hr: 0 })).toEqual({
            actual_duration_sec: 1800,
            actual_distance_m: 5235,
            actual_avg_hr: 147,
        })
    })

    it('lo que el hub no trajo no se inventa', () => {
        const sinDatos = workout({ id: 'x', startMs: T0, endMs: T0 + 20 * MIN, durationSec: 0 })
        expect(hubImportPatch(sinDatos, EMPTY_AXES)).toEqual({})
    })

    it('clampea la FC promedio degenerada del hub al rango del schema', () => {
        const bajo = workout({ id: 'lo', startMs: T0, endMs: T0 + MIN, avgHr: 4 })
        const alto = workout({ id: 'hi', startMs: T0, endMs: T0 + MIN, avgHr: 900 })
        expect(hubImportPatch(bajo, EMPTY_AXES).actual_avg_hr).toBe(HUB_HR_MIN_BPM)
        expect(hubImportPatch(alto, EMPTY_AXES).actual_avg_hr).toBe(HUB_HR_MAX_BPM)
    })

    it('valores no finitos del hub se descartan', () => {
        const sucio = workout({
            id: 'nan',
            startMs: T0,
            endMs: T0 + MIN,
            durationSec: Number.NaN,
            distanceM: Number.POSITIVE_INFINITY,
            avgHr: Number.NaN,
        })
        expect(hubImportPatch(sucio, EMPTY_AXES)).toEqual({})
    })
})

describe('hubZoneSec', () => {
    it('sin serie o sin perfil FC devuelve null (nada que clasificar)', () => {
        expect(hubZoneSec(null, PROFILE)).toBeNull()
        expect(hubZoneSec([], PROFILE)).toBeNull()
        expect(
            hubZoneSec(
                [
                    [0, 130],
                    [1, 130],
                ],
                null,
            ),
        ).toBeNull()
        expect(hubZoneSec([[0, 130]], { max_hr: null, resting_hr: null })).toBeNull()
    })

    it('acumula segundos por zona con la misma regla de dwell que el stream BLE', () => {
        expect(
            hubZoneSec(
                [
                    [0, 130],
                    [1, 132],
                    [2, 165],
                    [3, 185],
                ],
                PROFILE,
            ),
        ).toEqual({ '1': 0, '2': 1, '3': 0, '4': 1, '5': 1 })
    })

    it('la primera muestra no aporta y los gaps largos se capan en 10 s', () => {
        expect(
            hubZoneSec(
                [
                    [0, 130],
                    [600, 130],
                ],
                PROFILE,
            ),
        ).toEqual({ '1': 0, '2': 10, '3': 0, '4': 0, '5': 0 })
    })

    it('series a baja frecuencia (1 muestra cada 5 s) acumulan el intervalo real', () => {
        expect(
            hubZoneSec(
                [
                    [0, 150],
                    [5, 150],
                    [10, 150],
                ],
                PROFILE,
            ),
        ).toEqual({ '1': 0, '2': 0, '3': 10, '4': 0, '5': 0 })
    })

    it('descarta muestras invalidas sin adelantar el reloj', () => {
        expect(
            hubZoneSec(
                [
                    [0, 130],
                    [1, 0],
                    [2, 130],
                    [3, Number.NaN],
                ],
                PROFILE,
            ),
        ).toEqual({ '1': 0, '2': 2, '3': 0, '4': 0, '5': 0 })
    })

    it('muestras desordenadas no restan tiempo', () => {
        expect(
            hubZoneSec(
                [
                    [10, 130],
                    [5, 130],
                    [12, 130],
                ],
                PROFILE,
            ),
        ).toEqual({ '1': 0, '2': 7, '3': 0, '4': 0, '5': 0 })
    })

    it('respeta Karvonen cuando el perfil trae FC reposo (mismos cortes que la prescripcion)', () => {
        // FCmax 200, reposo 50 ⇒ reserva 150: Z2 = [140, 155].
        const karvonen: HrToZoneProfile = { max_hr: 200, resting_hr: 50 }
        expect(
            hubZoneSec(
                [
                    [0, 150],
                    [1, 150],
                ],
                karvonen,
            ),
        ).toEqual({ '1': 0, '2': 1, '3': 0, '4': 0, '5': 0 })
        // El mismo bpm con %FCmax cae en Z3 — la diferencia es real, no un bug del acumulador.
        expect(
            hubZoneSec(
                [
                    [0, 150],
                    [1, 150],
                ],
                PROFILE,
            ),
        ).toEqual({ '1': 0, '2': 0, '3': 1, '4': 0, '5': 0 })
    })
})
