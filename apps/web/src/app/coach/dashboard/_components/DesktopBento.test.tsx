import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { DashboardV2Data, KpiDeltas } from '../_data/types'

/**
 * Deltas de los 4 tiles del bento de escritorio (mini-plan 7C, tarea 7C.3).
 *
 * Lo que este test pinnea:
 *  - los tiles pintan el `text` que viene ARMADO de la capa de datos (`_lib/kpi-deltas`) y NO
 *    literales propios: hasta 7C.2 el bento decía «+1 esta semana», «+3 vs. semana previa» y
 *    «registradas» pasara lo que pasara, así que tres superficies mentían con el mismo número;
 *  - «En riesgo» conserva su caption fija («requieren revisión»), que describe el número y no es
 *    un delta — su delta real exige el snapshot diario de la fase 2 y hasta entonces vale `null`;
 *  - un delta `null` NO pinta línea: sin comparación honesta el tile se calla, nunca inventa;
 *  - el `tone` del servidor se mapea a tokens del DS (`--success-600` / `--danger-600` /
 *    `--text-muted`), nunca a colores crudos: es lo que sostiene dark mode y white-label.
 *
 * `CreateClientModal` se mockea porque arrastra las server actions de alta de alumnos; el bento
 * solo lo monta cerrado y no aporta nada a lo que se está probando.
 */

vi.mock('../../clients/CreateClientModal', () => ({
    CreateClientModal: () => null,
}))

import { DesktopBento, deltaToneClass } from './DesktopBento'

/** Regex de los literales que el bento hardcodeaba antes de 7C. Ninguno puede volver. */
const LITERALES_VIEJOS = /\+1 esta semana|\+3 vs\. semana previa|registradas/

const SIN_DELTAS: KpiDeltas = {
    clients: null,
    risk: null,
    adherence: null,
    sessionsToday: null,
}

function makeData(deltas: KpiDeltas): DashboardV2Data {
    return {
        kpi: {
            mrrCurrentMonth: 0,
            mrrPreviousMonth: 0,
            mrrDeltaPct: 0,
            totalClients: 12,
            riskCount: 3,
            avgAdherence: 71,
            avgNutrition: 0,
            deltas,
        },
        activePlans: 0,
        hasStudentSignal30d: false,
        clientList: [],
        clientPaymentSummary: [],
        adherenceStats: [],
        nutritionStats: [],
        recentActivities: [],
        pendingCheckinsCount: 0,
        expiringPrograms: [],
        topRiskClients: [],
        areaData: [],
        barData: [],
        agenda: [],
        pulse: [],
        subscriptionStatus: null,
        currentPeriodEnd: null,
        trialEndsAt: null,
    }
}

function renderBento(deltas: KpiDeltas) {
    return render(
        <DesktopBento
            data={makeData(deltas)}
            coachName="Ana Pérez"
            coachInviteCode={null}
            onAdherence={() => {}}
        />
    )
}

describe('DesktopBento — deltas de los KPI', () => {
    afterEach(() => {
        cleanup()
    })

    it('pinta el texto que viene del servidor en Alumnos, Adherencia y Sesiones hoy', () => {
        renderBento({
            clients: { value: 2, text: '+2 esta semana', tone: 'positive' },
            risk: null,
            adherence: { value: -4, text: '−4 pts vs. semana previa', tone: 'negative' },
            sessionsToday: { value: 0, text: 'igual que ayer', tone: 'neutral' },
        })

        expect(screen.getByText('+2 esta semana')).toBeInTheDocument()
        expect(screen.getByText('−4 pts vs. semana previa')).toBeInTheDocument()
        expect(screen.getByText('igual que ayer')).toBeInTheDocument()
    })

    it('«En riesgo» mantiene su caption fija porque su delta todavía no existe', () => {
        const { container } = renderBento({
            clients: { value: 2, text: '+2 esta semana', tone: 'positive' },
            risk: null,
            adherence: { value: 3, text: '+3 pts vs. semana previa', tone: 'positive' },
            sessionsToday: { value: 1, text: '+1 vs. ayer', tone: 'positive' },
        })

        expect(screen.getByText('requieren revisión')).toBeInTheDocument()
        expect(container.textContent).not.toMatch(LITERALES_VIEJOS)
    })

    it('con todos los deltas en null no pinta ningún literal viejo ni inventa números', () => {
        const { container } = renderBento(SIN_DELTAS)

        expect(container.textContent).not.toMatch(LITERALES_VIEJOS)
        // Lo único que sobrevive sin datos es la caption del tile de riesgo (no es un delta).
        expect(screen.getByText('requieren revisión')).toBeInTheDocument()
        expect(screen.queryByText(/vs\. ayer|vs\. semana previa|esta semana/)).toBeNull()
    })

    it('mapea el tono del servidor a los tokens del DS, no a colores crudos', () => {
        expect(deltaToneClass('positive')).toBe('text-[var(--success-600)]')
        expect(deltaToneClass('negative')).toBe('text-[var(--danger-600)]')
        expect(deltaToneClass('neutral')).toBe('text-[var(--text-muted)]')

        renderBento({
            clients: { value: 2, text: '+2 esta semana', tone: 'positive' },
            risk: null,
            adherence: { value: -4, text: '−4 pts vs. semana previa', tone: 'negative' },
            sessionsToday: { value: 0, text: 'igual que ayer', tone: 'neutral' },
        })

        expect(screen.getByText('+2 esta semana')).toHaveClass('text-[var(--success-600)]')
        expect(screen.getByText('−4 pts vs. semana previa')).toHaveClass('text-[var(--danger-600)]')
        expect(screen.getByText('igual que ayer')).toHaveClass('text-[var(--text-muted)]')
    })
})
