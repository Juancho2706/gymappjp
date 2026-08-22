import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('../_actions/clients.actions', () => ({ createClientAction: vi.fn() }))
vi.mock('../../dashboard/_lib/onboarding-telemetry.client', () => ({ postStepCompleted: vi.fn() }))
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}))

import { AddStudentFlowProvider } from './AddStudentFlowProvider'
import { useAddStudentFlow, type AddStudentFlowConfig } from './add-student-flow-context'

const BASE: AddStudentFlowConfig = {
    persona: 'strength',
    inviteCode: 'AB3KP',
    brand: { name: 'JP Coaching', logoUrl: null, primaryColor: '#1462DC', showsEvaBadge: true },
    firstContent: { programName: null, demoName: null },
    realClientCount: 0,
}

/** Cualquiera de las 4 entradas del directorio: todas llaman al MISMO `start()`. */
function Trigger() {
    const flow = useAddStudentFlow()
    return (
        <button type="button" onClick={flow.start}>
            Nuevo alumno
        </button>
    )
}

function renderFlow(config: AddStudentFlowConfig) {
    return render(
        <AddStudentFlowProvider config={config}>
            <Trigger />
            <p>directorio</p>
        </AddStudentFlowProvider>
    )
}

const GUIDED_TITLE = /Suma tu primer alumno en 3 pasos/i
const MODAL_TITLE = /Agregar Nuevo Alumno/i

describe('AddStudentFlowProvider — primer alta ⇒ stepper, siguientes ⇒ modal (F4.1)', () => {
    it('sin alumnos reales, «Nuevo alumno» abre el alta guiada', () => {
        renderFlow(BASE)
        expect(screen.queryByRole('heading', { name: GUIDED_TITLE })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Nuevo alumno' }))
        expect(screen.getByRole('heading', { name: GUIDED_TITLE })).toBeInTheDocument()
        expect(screen.queryByText(MODAL_TITLE)).not.toBeInTheDocument()
    })

    it('con alumnos reales, «Nuevo alumno» abre el modal de siempre', () => {
        renderFlow({ ...BASE, realClientCount: 3 })
        fireEvent.click(screen.getByRole('button', { name: 'Nuevo alumno' }))
        expect(screen.getByText(MODAL_TITLE)).toBeInTheDocument()
        expect(screen.queryByRole('heading', { name: GUIDED_TITLE })).not.toBeInTheDocument()
    })

    it('`?invite=1` (paso 4 de la guía) abre el alta guiada al entrar, con cartera o sin ella', () => {
        renderFlow({ ...BASE, realClientCount: 12, autoOpenGuided: true })
        expect(screen.getByRole('heading', { name: GUIDED_TITLE })).toBeInTheDocument()
    })

    it('el modal ofrece el escape «Hazlo paso a paso» y lleva al alta guiada', () => {
        renderFlow({ ...BASE, realClientCount: 3 })
        fireEvent.click(screen.getByRole('button', { name: 'Nuevo alumno' }))
        fireEvent.click(screen.getByRole('button', { name: /Hazlo paso a paso/i }))
        expect(screen.getByRole('heading', { name: GUIDED_TITLE })).toBeInTheDocument()
    })

    it('sin config (fuera del directorio) no hay alta guiada y el modal no ofrece el escape', () => {
        render(
            <AddStudentFlowProvider config={null}>
                <Trigger />
            </AddStudentFlowProvider>
        )
        fireEvent.click(screen.getByRole('button', { name: 'Nuevo alumno' }))
        expect(screen.queryByRole('heading', { name: GUIDED_TITLE })).not.toBeInTheDocument()
        expect(screen.queryByText(MODAL_TITLE)).not.toBeInTheDocument()
    })
})
