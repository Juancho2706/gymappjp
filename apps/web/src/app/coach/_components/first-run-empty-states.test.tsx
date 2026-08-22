import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TEMPLATE_CATALOG } from '@eva/onboarding'

// Las cuatro pantallas montan el `TemplatePicker`, que llama a una server action. Acá solo
// importa el CONTRATO del vacío (qué dice, a quién nombra, qué acción ofrece).
vi.mock('../_actions/templates.actions', () => ({
    applyTemplateAction: vi.fn().mockResolvedValue({ ok: false, reason: 'not_implemented' }),
}))

import { ProgramsFirstRunEmpty } from '../workout-programs/components/ProgramsFirstRunEmpty'
import { NutritionFirstRunEmpty } from '../nutrition-v2/_components/NutritionFirstRunEmpty'
import { MovementFirstRunEmpty } from '../movement/_components/MovementFirstRunEmpty'
import { CardioFirstRunEmpty } from '../cardio/_components/CardioFirstRunEmpty'

const DEMO_ID = '00000000-0000-4000-8000-000000000001'

describe('Vacíos template-first (SPEC coach-onboarding-v2 §7, TASKS F3.6)', () => {
    describe('Programas / builder', () => {
        it('CON demo: plantillas de la rama + el ejemplo como sujeto + escape a cero', () => {
            render(
                <ProgramsFirstRunEmpty
                    templates={TEMPLATE_CATALOG.strength}
                    clients={[{ id: DEMO_ID, name: 'Matías', isDemo: true }]}
                    demoClientId={DEMO_ID}
                    demoName="Matías"
                    demoLabel="Alumno de ejemplo"
                    noun="alumno"
                />,
            )

            expect(
                screen.getByRole('heading', { name: 'Arma tu primera rutina desde una plantilla' }),
            ).toBeInTheDocument()
            expect(screen.getByText('Empieza con Matías, tu alumno de ejemplo')).toBeInTheDocument()
            expect(screen.getByText('Full body 3 días')).toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'Empezar desde cero' })).toHaveAttribute(
                'href',
                '/coach/workout-programs/builder',
            )
        })

        it('SIN demo ni alumnos: sin sujeto inventado y la acción es invitar al primero', () => {
            render(
                <ProgramsFirstRunEmpty
                    templates={TEMPLATE_CATALOG.strength}
                    clients={[]}
                    demoClientId={null}
                    demoName={null}
                    demoLabel="Alumno de ejemplo"
                    noun="alumno"
                />,
            )

            expect(screen.queryByText(/Empieza con/)).not.toBeInTheDocument()
            expect(screen.getByRole('link', { name: /Invita a tu primer alumno/ })).toBeInTheDocument()
            // El escape sigue disponible: nadie queda encerrado en el vacío.
            expect(screen.getByRole('link', { name: 'Empezar desde cero' })).toBeInTheDocument()
        })
    })

    describe('Nutrición V2', () => {
        it('CON demo: plantillas de pauta y escape al editor del ejemplo', () => {
            render(
                <NutritionFirstRunEmpty
                    templates={TEMPLATE_CATALOG.nutrition}
                    clients={[{ id: DEMO_ID, name: 'Ana', isDemo: true }]}
                    demoClientId={DEMO_ID}
                    demoName="Ana"
                    demoLabel="Paciente de ejemplo"
                    noun="paciente"
                />,
            )

            expect(
                screen.getByRole('heading', { name: 'Arma tu primera pauta desde una plantilla' }),
            ).toBeInTheDocument()
            expect(screen.getByText('Empieza con Ana, tu paciente de ejemplo')).toBeInTheDocument()
            expect(screen.getByText('1800 kcal por porciones')).toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'Empezar desde cero' })).toHaveAttribute(
                'href',
                `/coach/nutrition-v2/${DEMO_ID}/editor`,
            )
        })

        it('SIN demo: no ofrece un editor sin sujeto', () => {
            render(
                <NutritionFirstRunEmpty
                    templates={TEMPLATE_CATALOG.nutrition}
                    clients={[]}
                    demoClientId={null}
                    demoName={null}
                    demoLabel="Paciente de ejemplo"
                    noun="paciente"
                />,
            )

            expect(screen.queryByRole('link', { name: 'Empezar desde cero' })).not.toBeInTheDocument()
            expect(screen.getByRole('link', { name: /Invita a tu primer paciente/ })).toBeInTheDocument()
        })
    })

    describe('Movimiento', () => {
        it('CON demo: la única acción es evaluar al ejemplo', () => {
            render(
                <MovementFirstRunEmpty
                    demoClientId={DEMO_ID}
                    demoName="Pedro"
                    demoLabel="Paciente de ejemplo"
                    noun="paciente"
                />,
            )

            expect(
                screen.getByRole('heading', { name: 'Haz tu primer screening de 7 patrones' }),
            ).toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'Evaluar a Pedro' })).toHaveAttribute(
                'href',
                `/coach/movement/${DEMO_ID}/new`,
            )
        })

        it('SIN demo ni alumnos: la acción cae a invitar al primero', () => {
            render(
                <MovementFirstRunEmpty
                    demoClientId={null}
                    demoName={null}
                    demoLabel="Paciente de ejemplo"
                    noun="paciente"
                />,
            )

            expect(screen.queryByText(/Empieza con/)).not.toBeInTheDocument()
            expect(screen.getByRole('link', { name: /Invita a tu primer paciente/ })).toHaveAttribute(
                'href',
                '/coach/clients?invite=1',
            )
        })
    })

    describe('Cardio', () => {
        it('CON demo: nombra el valor y abre las zonas del ejemplo', () => {
            render(
                <CardioFirstRunEmpty
                    demoClientId={DEMO_ID}
                    demoName="Javiera"
                    demoLabel="Atleta de ejemplo"
                    noun="atleta"
                />,
            )

            expect(
                screen.getByRole('heading', { name: 'Calcula las zonas de tu primer atleta' }),
            ).toBeInTheDocument()
            expect(screen.getByText('Empieza con Javiera, tu atleta de ejemplo')).toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'Ver las zonas de Javiera' })).toHaveAttribute(
                'href',
                `/coach/cardio/${DEMO_ID}`,
            )
        })

        it('SIN demo pero con un alumno real: usa a ese como sujeto de la acción', () => {
            render(
                <CardioFirstRunEmpty
                    demoClientId={null}
                    demoName={null}
                    demoLabel="Atleta de ejemplo"
                    noun="atleta"
                    firstClientId="00000000-0000-4000-8000-000000000009"
                />,
            )

            expect(screen.queryByText(/Empieza con/)).not.toBeInTheDocument()
            expect(screen.getByRole('link', { name: 'Cargar el primer perfil' })).toHaveAttribute(
                'href',
                '/coach/cardio/00000000-0000-4000-8000-000000000009',
            )
        })
    })
})
