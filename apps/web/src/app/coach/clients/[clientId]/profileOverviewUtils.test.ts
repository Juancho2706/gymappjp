import { describe, expect, it } from 'vitest'
import { formatRelativeLastActivity } from './profileOverviewUtils'

/**
 * Regresión EVA-NEXTJS-18 (O7.6b): `profileLastActivityAt` es un instante UTC (el máximo de varios
 * `timestamptz`) y el hero de la ficha lo pinta en el SSR. Con `formatShortDayMonthYearEs(new
 * Date(iso))` el día salía de los getters LOCALES del runtime: Vercel (UTC) imprimía un día y el
 * navegador del coach (Chile) otro para cualquier actividad nocturna chilena.
 */
describe('profileOverviewUtils — formatRelativeLastActivity (fecha absoluta en Santiago)', () => {
    it('una actividad de las 23:30 en Chile NO se corre al día siguiente', () => {
        // 2024-03-05T02:30:00Z = 04-mar 23:30 en Santiago (verano, UTC-3).
        expect(formatRelativeLastActivity('2024-03-05T02:30:00Z')).toBe('04 mar 2024')
    })

    it('cruzada la medianoche chilena sí avanza el día', () => {
        expect(formatRelativeLastActivity('2024-03-05T03:30:00Z')).toBe('05 mar 2024')
    })

    it('sin actividad o con instante inválido devuelve el texto vacío de la ficha', () => {
        expect(formatRelativeLastActivity(null)).toBe('Sin actividad reciente')
        expect(formatRelativeLastActivity('basura')).toBe('Sin actividad reciente')
    })

    it('las etiquetas relativas recientes siguen ganando a la fecha absoluta', () => {
        const ahora = new Date()
        expect(formatRelativeLastActivity(ahora.toISOString())).toBe('Hoy')
        const ayer = new Date(ahora.getTime() - 24 * 60 * 60 * 1000)
        expect(formatRelativeLastActivity(ayer.toISOString())).toBe('Ayer')
    })
})
