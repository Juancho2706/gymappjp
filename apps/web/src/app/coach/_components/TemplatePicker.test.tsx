import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { OnboardingTemplate } from '@eva/onboarding'

const { applyTemplateActionMock } = vi.hoisted(() => ({
    applyTemplateActionMock: vi.fn(),
}))

vi.mock('../_actions/templates.actions', () => ({
    applyTemplateAction: applyTemplateActionMock,
}))

import { TemplateFirstEmptyState, TemplatePicker } from './TemplatePicker'

const TEMPLATES: OnboardingTemplate[] = [
    { id: 'full-body-3', label: 'Full body 3 días', blurb: 'Cuerpo completo, para arrancar o volver.' },
    { id: 'ppl', label: 'Push / Pull / Legs', blurb: 'Empuje, tracción y pierna, 3 o 6 días.' },
]

const DEMO_ID = '00000000-0000-4000-8000-000000000001'

describe('TemplatePicker (vacío template-first, onboarding v2 F3.6)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('pinta una tarjeta por plantilla, con su bajada', () => {
        render(
            <TemplatePicker
                templates={TEMPLATES}
                clients={[{ id: DEMO_ID, name: 'Matías', isDemo: true }]}
                defaultClientId={DEMO_ID}
                demoLabel="Alumno de ejemplo"
                noun="alumno"
            />,
        )

        expect(screen.getByText('Full body 3 días')).toBeInTheDocument()
        expect(screen.getByText('Cuerpo completo, para arrancar o volver.')).toBeInTheDocument()
        expect(screen.getByText('Push / Pull / Legs')).toBeInTheDocument()
    })

    it('rotula al alumno de ejemplo en el selector y lo usa como destino por defecto', async () => {
        applyTemplateActionMock.mockResolvedValue({ ok: true })
        render(
            <TemplatePicker
                templates={TEMPLATES}
                clients={[
                    { id: DEMO_ID, name: 'Matías', isDemo: true },
                    { id: '00000000-0000-4000-8000-000000000002', name: 'Sofía' },
                ]}
                defaultClientId={DEMO_ID}
                demoLabel="Alumno de ejemplo"
                noun="alumno"
            />,
        )

        expect(screen.getByRole('option', { name: 'Matías · Alumno de ejemplo' })).toBeInTheDocument()

        fireEvent.click(screen.getByText('Full body 3 días'))
        await waitFor(() => {
            expect(applyTemplateActionMock).toHaveBeenCalledWith({
                templateId: 'full-body-3',
                clientId: DEMO_ID,
            })
        })
    })

    it('tolera `not_implemented`: avisa «Plantilla en preparación» y no rompe el vacío', async () => {
        // El sembrador real (W3 F3.1) todavía puede no existir: el stub responde así.
        applyTemplateActionMock.mockResolvedValue({
            ok: false,
            reason: 'not_implemented',
            error: 'Plantilla en preparación.',
        })
        render(
            <TemplatePicker
                templates={TEMPLATES}
                clients={[{ id: DEMO_ID, name: 'Matías', isDemo: true }]}
                defaultClientId={DEMO_ID}
                demoLabel="Alumno de ejemplo"
                noun="alumno"
            />,
        )

        fireEvent.click(screen.getByText('Full body 3 días'))

        await waitFor(() => {
            expect(screen.getByRole('status')).toHaveTextContent(/Plantilla en preparación/)
        })
        // Las plantillas siguen a la vista: el vacío no se convirtió en un error.
        expect(screen.getByText('Push / Pull / Legs')).toBeInTheDocument()
    })

    it('sin alumnos no llama al servidor: ofrece invitar al primero', async () => {
        render(
            <TemplatePicker
                templates={TEMPLATES}
                clients={[]}
                demoLabel="Paciente de ejemplo"
                noun="paciente"
            />,
        )

        expect(screen.getByRole('link', { name: /Invita a tu primer paciente/ })).toHaveAttribute(
            'href',
            '/coach/clients?invite=1',
        )

        fireEvent.click(screen.getByText('Full body 3 días'))
        await waitFor(() => {
            expect(screen.getByRole('status')).toHaveTextContent(/invita a tu primer paciente/i)
        })
        expect(applyTemplateActionMock).not.toHaveBeenCalled()
    })

    it('muestra un error real cuando el servidor rechaza', async () => {
        applyTemplateActionMock.mockResolvedValue({
            ok: false,
            reason: 'sin_acceso',
            error: 'Ese alumno no es tuyo.',
        })
        render(
            <TemplatePicker
                templates={TEMPLATES}
                clients={[{ id: DEMO_ID, name: 'Matías', isDemo: true }]}
                defaultClientId={DEMO_ID}
                demoLabel="Alumno de ejemplo"
                noun="alumno"
            />,
        )

        fireEvent.click(screen.getByText('Push / Pull / Legs'))
        await waitFor(() => {
            expect(screen.getByRole('status')).toHaveTextContent('Ese alumno no es tuyo.')
        })
    })
})

describe('TemplateFirstEmptyState', () => {
    it('nombra el valor, muestra al demo como sujeto y deja el escape', () => {
        render(
            <TemplateFirstEmptyState
                eyebrow="Tu primera rutina"
                title="Arma tu primera rutina desde una plantilla"
                description="Elige una y queda lista para asignar."
                subject="Empieza con Matías, tu alumno de ejemplo"
                escape={{ href: '/coach/workout-programs/builder', label: 'Empezar desde cero' }}
            />,
        )

        expect(
            screen.getByRole('heading', { name: 'Arma tu primera rutina desde una plantilla' }),
        ).toBeInTheDocument()
        expect(screen.getByText('Empieza con Matías, tu alumno de ejemplo')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Empezar desde cero' })).toHaveAttribute(
            'href',
            '/coach/workout-programs/builder',
        )
    })

    it('sin demo no inventa un sujeto', () => {
        render(
            <TemplateFirstEmptyState
                eyebrow="Tu primera rutina"
                title="Arma tu primera rutina desde una plantilla"
                description="Elige una y queda lista para asignar."
                subject={null}
            />,
        )
        expect(screen.queryByText(/Empieza con/)).not.toBeInTheDocument()
    })
})
