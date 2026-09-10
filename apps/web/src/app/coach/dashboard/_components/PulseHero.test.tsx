import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { KpiSummary } from '../_data/types'

/**
 * Stat «Adherencia» del Pulse hero (reporte del owner 10-09-2026).
 *
 * Un coach recién registrado, con 0 alumnos reales, veía «Adherencia 78 % · +2 pts» porque el KPI
 * del server contaba al alumno de ejemplo. Eso ya se arregló (`is_demo` excluido) y el número pasó
 * a ser un «0 %» honesto pero mentiroso de otra forma: un cero se lee como «tus alumnos no
 * entrenan» cuando lo que pasa es que todavía no hay alumnos.
 *
 * Lo que este test pinnea:
 *  - sin alumnos el stat vale «—», sin sparkline y sin delta, con la caption «sin alumnos todavía»;
 *  - con alumnos vuelve el porcentaje real, su sparkline y el delta que arma el servidor.
 *
 * `EvaCountUp` se mockea porque anima con `requestAnimationFrame` arrancando en 0: sin el mock, el
 * porcentaje recién existe cientos de ms después del render y el test tendría que esperar frames.
 * El caso «—» NO pasa por ese componente (no es un número), así que el mock no tapa la rama nueva.
 */

vi.mock('./EvaCountUp', () => ({
    EvaCountUp: ({ value, suffix = '' }: { value: number; suffix?: string }) => (
        <>
            {value}
            {suffix}
        </>
    ),
}))

import { PulseHero } from './PulseHero'

function makeKpi(overrides: Partial<KpiSummary>): KpiSummary {
    return {
        mrrCurrentMonth: 0,
        mrrPreviousMonth: 0,
        mrrDeltaPct: 0,
        totalClients: 0,
        riskCount: 0,
        avgAdherence: 0,
        avgNutrition: 0,
        deltas: { clients: null, risk: null, adherence: null, sessionsToday: null },
        ...overrides,
    }
}

describe('PulseHero — stat de adherencia', () => {
    afterEach(() => {
        cleanup()
    })

    it('con alumnos pinta el porcentaje real, su sparkline y el delta del servidor', () => {
        const { container } = render(
            <PulseHero
                kpi={makeKpi({
                    totalClients: 4,
                    avgAdherence: 71,
                    deltas: {
                        clients: null,
                        risk: null,
                        adherence: { value: 3, text: '+3 pts vs. semana previa', tone: 'positive' },
                        sessionsToday: null,
                    },
                })}
                onAdherence={() => {}}
            />
        )

        expect(screen.getByText('71%')).toBeInTheDocument()
        expect(screen.getByText('+3 pts vs. semana previa')).toBeInTheDocument()
        expect(container.querySelector('svg')).not.toBeNull()
        expect(screen.queryByText('—')).toBeNull()
    })

    it('sin alumnos pinta «—» y se calla: ni sparkline ni delta', () => {
        const { container } = render(
            <PulseHero
                kpi={makeKpi({
                    totalClients: 0,
                    avgAdherence: 0,
                    deltas: {
                        clients: null,
                        risk: null,
                        // Aunque el servidor mandara un delta, sin alumnos no hay tendencia que contar.
                        adherence: { value: 2, text: '+2 pts vs. semana previa', tone: 'positive' },
                        sessionsToday: null,
                    },
                })}
                onAdherence={() => {}}
            />
        )

        expect(screen.getByText('—')).toBeInTheDocument()
        expect(screen.getByText('sin alumnos todavía')).toBeInTheDocument()
        expect(screen.queryByText('+2 pts vs. semana previa')).toBeNull()
        // La sparkline es el único `svg` del hero: sin alumnos no queda ninguno.
        expect(container.querySelector('svg')).toBeNull()
        expect(container.textContent).not.toMatch(/0%/)
    })
})
