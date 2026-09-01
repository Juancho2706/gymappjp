import { describe, expect, it } from 'vitest'
import { dashboardQuickActions } from './quick-actions'

/**
 * W2.7 — el FAB del panel no ofrece atajos a rutas que el gate de dominio (W1.4a) va a redirigir.
 * Contrato: fail-OPEN (solo el `false` explícito esconde) y una sola acción gobernada por dominio
 * («Programa» → `/coach/workout-programs`, dominio `training`).
 */
describe('dashboardQuickActions', () => {
    it('sin dominios resueltos ofrece las 3 acciones (fail-open)', () => {
        expect(dashboardQuickActions({}).map((a) => a.label)).toEqual([
            'Crear alumno',
            'Importar',
            'Programa',
        ])
    })

    it('sin argumento se comporta igual que con `{}` (prop opcional del shell)', () => {
        expect(dashboardQuickActions().map((a) => a.id)).toEqual([
            'create_client',
            'import',
            'program',
        ])
    })

    it('training apagado esconde «Programa» y conserva el resto', () => {
        const labels = dashboardQuickActions({ training: false }).map((a) => a.label)
        expect(labels).toEqual(['Crear alumno', 'Importar'])
        expect(labels).toHaveLength(2)
    })

    it('training prendido explícitamente ofrece las 3', () => {
        expect(dashboardQuickActions({ training: true })).toHaveLength(3)
    })

    it('otro dominio apagado no toca el FAB (ninguna acción cuelga de nutrition)', () => {
        expect(dashboardQuickActions({ nutrition: false }).map((a) => a.label)).toEqual([
            'Crear alumno',
            'Importar',
            'Programa',
        ])
    })

    it('los 5 dominios apagados dejan solo las acciones sin dominio', () => {
        const labels = dashboardQuickActions({
            training: false,
            nutrition: false,
            cardio: false,
            movement: false,
            bodycomp: false,
        }).map((a) => a.label)
        expect(labels).toEqual(['Crear alumno', 'Importar'])
    })

    it('no comparte la referencia del catálogo: filtrar no muta el original', () => {
        dashboardQuickActions({ training: false })
        expect(dashboardQuickActions({})).toHaveLength(3)
    })
})
