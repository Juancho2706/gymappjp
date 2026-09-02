import { describe, expect, it } from 'vitest'
import type { BodyCompositionRow } from '@/infrastructure/db/body-composition.repository'
import { deviceLabel } from './view-helpers'

/**
 * Fila mínima: `deviceLabel` solo lee marca, modelo y `measured_at`, así que el resto del row
 * (jsonb, ids, flags de auditoría) es ruido para este test.
 */
function row(partial: Partial<BodyCompositionRow>): BodyCompositionRow {
    return { method: 'bia', measured_at: '2026-06-10T15:00:00Z', ...partial } as BodyCompositionRow
}

/**
 * Regresión EVA-NEXTJS-18 (O7.6b): `measured_at` es un `timestamptz` y la etiqueta se pinta en el
 * SSR (paneles del coach + card del alumno). Derivar el día con `new Date(iso).getDate()` lo corría
 * al día siguiente en el runtime UTC de Vercel para cualquier medición nocturna chilena, y el texto
 * del HTML dejaba de coincidir con el que producía el navegador al hidratar.
 */
describe('view-helpers — deviceLabel (día calendario en Santiago, sin Intl para el mes)', () => {
    it('una medición de las 22:30 en Chile NO se corre al día siguiente', () => {
        // 2026-06-11T02:30:00Z = 10-jun 22:30 en Santiago (UTC-4).
        expect(deviceLabel(row({ device_brand: 'InBody', device_model: '570', measured_at: '2026-06-11T02:30:00Z' })))
            .toBe('InBody 570 · 10-jun')
    })

    it('cruzada la medianoche chilena sí avanza el día', () => {
        expect(deviceLabel(row({ device_brand: 'InBody', measured_at: '2026-06-11T04:30:00Z' }))).toBe(
            'InBody · 11-jun'
        )
    })

    it('sin marca ni modelo la etiqueta es solo la fecha', () => {
        expect(deviceLabel(row({ measured_at: '2026-09-03T01:30:00Z' }))).toBe('02-sept')
    })

    it('instante inválido → etiqueta sin fecha basura (nunca "Invalid Date")', () => {
        expect(deviceLabel(row({ device_brand: 'InBody', measured_at: 'basura' }))).toBe('InBody · ')
    })
})
