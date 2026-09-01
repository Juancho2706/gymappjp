import { describe, expect, it } from 'vitest'
import { adherenceDelta, buildKpiDeltas, clientsDelta, riskDelta, sessionsTodayDelta } from './kpi-deltas'

/**
 * Los deltas del bento del coach son el ÚNICO número del panel que se lee como juicio («vamos
 * mejor / vamos peor»). Antes eran literales pintados a mano (`+1 esta semana`, `+3 vs. semana
 * previa`) en web y RN; acá se fija el criterio real, incluidos los casos donde el honesto es no
 * mostrar nada.
 */

/** Signo menos tipográfico (U+2212), el que espera el copy — no el guion ASCII. */
const MINUS_SIGN = '−'

describe('sessionsTodayDelta — «Sesiones hoy» vs. ayer', () => {
    it('sube: hoy 5, ayer 3', () => {
        const areaData = [
            { name: '31/08', sesiones: 3 },
            { name: '01/09', sesiones: 5 },
        ]
        expect(sessionsTodayDelta(areaData, '01/09', '31/08')).toEqual({
            value: 2,
            text: '+2 vs. ayer',
            tone: 'positive',
        })
    })

    it('baja: usa el signo menos tipografico, no el guion', () => {
        const areaData = [
            { name: '31/08', sesiones: 6 },
            { name: '01/09', sesiones: 2 },
        ]
        const delta = sessionsTodayDelta(areaData, '01/09', '31/08')
        expect(delta).toEqual({ value: -4, text: `${MINUS_SIGN}4 vs. ayer`, tone: 'negative' })
        expect(delta?.text).not.toContain('-4')
    })

    it('empate: «igual que ayer», tono neutro', () => {
        const areaData = [
            { name: '31/08', sesiones: 4 },
            { name: '01/09', sesiones: 4 },
        ]
        expect(sessionsTodayDelta(areaData, '01/09', '31/08')).toEqual({
            value: 0,
            text: 'igual que ayer',
            tone: 'neutral',
        })
    })

    it('ayer ausente de la serie vale 0 (areaData filtra los dias sin sesiones)', () => {
        const areaData = [{ name: '01/09', sesiones: 4 }]
        expect(sessionsTodayDelta(areaData, '01/09', '31/08')).toEqual({
            value: 4,
            text: '+4 vs. ayer',
            tone: 'positive',
        })
    })

    it('hoy ausente de la serie vale 0: el delta es negativo, no nulo', () => {
        const areaData = [{ name: '31/08', sesiones: 3 }]
        expect(sessionsTodayDelta(areaData, '01/09', '31/08')).toEqual({
            value: -3,
            text: `${MINUS_SIGN}3 vs. ayer`,
            tone: 'negative',
        })
    })

    it('serie vacia: ambos dias en 0 ⇒ igual que ayer', () => {
        expect(sessionsTodayDelta([], '01/09', '31/08')).toEqual({
            value: 0,
            text: 'igual que ayer',
            tone: 'neutral',
        })
    })
})

describe('adherenceDelta — semana actual vs. semana previa, en puntos', () => {
    const stat = (history: number[]) => ({ adherenceHistory4w: history })

    it('sube: promedia [3] y [2] por separado y dice «pts»', () => {
        const stats = [stat([10, 20, 60, 80]), stat([10, 20, 40, 60])]
        // avg[3] = 70, avg[2] = 50
        expect(adherenceDelta(stats)).toEqual({
            value: 20,
            text: '+20 pts vs. semana previa',
            tone: 'positive',
        })
    })

    it('baja: signo menos tipografico y tono negativo', () => {
        const stats = [stat([0, 0, 90, 80]), stat([0, 0, 70, 60])]
        // avg[3] = 70, avg[2] = 80
        expect(adherenceDelta(stats)).toEqual({
            value: -10,
            text: `${MINUS_SIGN}10 pts vs. semana previa`,
            tone: 'negative',
        })
    })

    it('empate: «igual que la semana previa»', () => {
        const stats = [stat([0, 0, 55, 55]), stat([0, 0, 65, 65])]
        expect(adherenceDelta(stats)).toEqual({
            value: 0,
            text: 'igual que la semana previa',
            tone: 'neutral',
        })
    })

    it('sin alumnos ⇒ null (no hay base de comparacion)', () => {
        expect(adherenceDelta([])).toBeNull()
    })

    it('todas las filas sin historia ⇒ null', () => {
        expect(adherenceDelta([{ adherenceHistory4w: [] }, {}, { adherenceHistory4w: null }])).toBeNull()
    })

    it('redondea cada semana con el mismo criterio que avgAdherence (.5 hacia arriba)', () => {
        const stats = [stat([0, 0, 50, 51]), stat([0, 0, 50, 50])]
        // avg[3] = round(50.5) = 51, avg[2] = round(50) = 50 ⇒ +1 (no 0)
        expect(adherenceDelta(stats)?.value).toBe(1)
    })

    it('una fila sin historia cuenta como 0 en el promedio (denominador = todas las filas)', () => {
        const stats = [stat([0, 0, 40, 80]), {}]
        // avg[3] = round(80 / 2) = 40, avg[2] = round(40 / 2) = 20
        expect(adherenceDelta(stats)).toEqual({
            value: 20,
            text: '+20 pts vs. semana previa',
            tone: 'positive',
        })
    })
})

describe('clientsDelta — altas de los ultimos 7 dias', () => {
    const NOW = '2026-09-01T12:00:00.000Z'

    it('cuenta solo las altas dentro de la ventana', () => {
        const signups = [
            { created_at: '2026-09-01T09:00:00.000Z' }, // hoy
            { created_at: '2026-08-30T00:00:00.000Z' }, // dentro
            { created_at: '2026-08-25T12:00:00.000Z' }, // borde exacto: entra
            { created_at: '2026-08-20T00:00:00.000Z' }, // fuera
            { created_at: '2026-04-01T00:00:00.000Z' }, // fuera (ventana larga del BarChart)
        ]
        expect(clientsDelta(signups, NOW)).toEqual({
            value: 3,
            text: '+3 esta semana',
            tone: 'positive',
        })
    })

    it('sin altas ⇒ copy neutro, nunca negativo', () => {
        expect(clientsDelta([{ created_at: '2026-07-01T00:00:00.000Z' }], NOW)).toEqual({
            value: 0,
            text: 'sin altas esta semana',
            tone: 'neutral',
        })
        expect(clientsDelta([], NOW)).toEqual({
            value: 0,
            text: 'sin altas esta semana',
            tone: 'neutral',
        })
    })

    it('acepta la lista de ISO pelados ademas de las filas del repositorio', () => {
        expect(clientsDelta(['2026-08-31T00:00:00.000Z', '2026-01-01T00:00:00.000Z'], NOW)?.value).toBe(1)
    })

    it('ignora fechas invalidas en vez de inflar el conteo', () => {
        expect(clientsDelta([{ created_at: 'no-es-fecha' }, { created_at: '2026-08-31T00:00:00.000Z' }], NOW)?.value).toBe(1)
    })
})

describe('riskDelta — fase 1 sin delta', () => {
    it('siempre null: el historico de riesgo exige snapshot diario (fase 2)', () => {
        expect(riskDelta()).toBeNull()
    })
})

describe('buildKpiDeltas — punto de entrada unico de las dos funciones V2', () => {
    it('arma las 4 llaves con «risk» en null', () => {
        const deltas = buildKpiDeltas({
            areaData: [
                { name: '31/08', sesiones: 2 },
                { name: '01/09', sesiones: 5 },
            ],
            todayKey: '01/09',
            yesterdayKey: '31/08',
            adherenceStats: [{ adherenceHistory4w: [0, 0, 50, 60] }],
            signupDates: [{ created_at: '2026-08-31T00:00:00.000Z' }],
            nowIso: '2026-09-01T12:00:00.000Z',
        })

        expect(Object.keys(deltas).sort()).toEqual(['adherence', 'clients', 'risk', 'sessionsToday'])
        expect(deltas.risk).toBeNull()
        expect(deltas.clients).toEqual({ value: 1, text: '+1 esta semana', tone: 'positive' })
        expect(deltas.adherence).toEqual({ value: 10, text: '+10 pts vs. semana previa', tone: 'positive' })
        expect(deltas.sessionsToday).toEqual({ value: 3, text: '+3 vs. ayer', tone: 'positive' })
    })

    it('coach sin datos: sin altas, sin adherencia, sin sesiones', () => {
        const deltas = buildKpiDeltas({
            areaData: [],
            todayKey: '01/09',
            yesterdayKey: '31/08',
            adherenceStats: [],
            signupDates: [],
            nowIso: '2026-09-01T12:00:00.000Z',
        })

        expect(deltas.clients).toEqual({ value: 0, text: 'sin altas esta semana', tone: 'neutral' })
        expect(deltas.adherence).toBeNull()
        expect(deltas.risk).toBeNull()
        expect(deltas.sessionsToday).toEqual({ value: 0, text: 'igual que ayer', tone: 'neutral' })
    })
})
