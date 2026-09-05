import { describe, expect, it } from 'vitest'
import { formatHabitLogDate, formatRelativeLastActivity } from './profileOverviewUtils'

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

/**
 * Regla de O7.3 (misma familia EVA-NEXTJS-18): la tabla de hábitos del Resumen se pinta en el SSR de
 * un client component, así que la abreviatura del mes NUNCA puede salir de `Intl` — el Safari nuevo
 * escribe "sept." con punto y el HTML deja de coincidir tras hidratar. `log_date` ya es un día
 * calendario (date-only), así que acá lo único en juego es el TEXTO, no el corrimiento de día.
 */
describe('profileOverviewUtils — formatHabitLogDate (mes por tabla fija, sin Intl)', () => {
    it('calca la salida vieja de Node: día de 2 dígitos + mes corto sin punto', () => {
        expect(formatHabitLogDate('2026-09-05')).toBe('05 sept')
        expect(formatHabitLogDate('2026-08-31')).toBe('31 ago')
        expect(formatHabitLogDate('2026-01-01')).toBe('01 ene')
    })

    it('el resultado no depende de la TZ del proceso: el día es el del string, tal cual', () => {
        // Antes se construía `new Date(y, m - 1, d)` (medianoche LOCAL) antes de formatear; con
        // tabla fija no hay `Date` de por medio y el 01 nunca puede imprimirse como 31 del anterior.
        expect(formatHabitLogDate('2026-12-01')).toBe('01 dic')
    })

    it('fuera de patrón se devuelve tal cual (defensivo, igual que antes)', () => {
        expect(formatHabitLogDate('sin-fecha')).toBe('sin-fecha')
    })
})
