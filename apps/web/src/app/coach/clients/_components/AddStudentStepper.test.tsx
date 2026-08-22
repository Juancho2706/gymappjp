import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { PERSONA_COPY } from '@eva/schemas'

// El stepper escribe por la server action real del modal: en el render solo interesa QUÉ se
// pinta y cuándo se habilita el CTA, así que la action y la telemetría se apagan.
vi.mock('../_actions/clients.actions', () => ({ createClientAction: vi.fn() }))
vi.mock('../../dashboard/_lib/onboarding-telemetry.client', () => ({
    postStepCompleted: vi.fn(),
}))
vi.mock('posthog-js/react', () => ({ usePostHog: () => undefined }))
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }))

import { AddStudentStepper, type AddStudentStepperProps } from './AddStudentStepper'

function renderStepper(over: Partial<AddStudentStepperProps> = {}) {
    const props: AddStudentStepperProps = {
        persona: 'strength',
        inviteCode: 'AB3KP',
        brand: {
            name: 'JP Coaching',
            logoUrl: null,
            primaryColor: '#1462DC',
            showsEvaBadge: true,
        },
        firstContent: { programName: null, demoName: null },
        onClose: vi.fn(),
        ...over,
    }
    return { props, ...render(<AddStudentStepper {...props} />) }
}

/** El CTA es el único submit del formulario. */
function cta(): HTMLButtonElement {
    return screen.getByRole('button', { name: /Invitar a/i }) as HTMLButtonElement
}

function fillMinimum(name = 'Ana Ruiz', email = 'ana@correo.com') {
    fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: name } })
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: email } })
    fireEvent.click(screen.getByRole('checkbox'))
}

describe('AddStudentStepper — los 3 pasos siempre a la vista (F4.1)', () => {
    it('pinta las tres columnas del artboard T1', () => {
        renderStepper()
        expect(screen.getByRole('heading', { name: 'Datos mínimos' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Cómo le llega' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Lo que va a ver' })).toBeInTheDocument()
    })

    it('el título habla el idioma de la persona', () => {
        renderStepper({ persona: 'nutrition' })
        expect(
            screen.getByRole('heading', { name: 'Suma tu primer paciente en 3 pasos' })
        ).toBeInTheDocument()
    })

    it('trae una cabecera de progreso para el apilado de móvil', () => {
        renderStepper()
        const progress = screen.getByRole('list', { name: 'Progreso del alta' })
        expect(within(progress).getAllByRole('listitem')).toHaveLength(3)
    })

    it('ofrece los tres canales como tarjetas elegibles', () => {
        renderStepper()
        expect(screen.getAllByRole('radio')).toHaveLength(3)
        // El nombre accesible de cada radio sale de su label: sin eso el canal no se puede
        // elegir con lector de pantalla.
        expect(screen.getByRole('radio', { name: /Por WhatsApp/ })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /Por correo/ })).toBeInTheDocument()
        expect(screen.getByRole('radio', { name: /En persona/ })).toBeInTheDocument()
    })
})

describe('AddStudentStepper — CTA', () => {
    it('arranca deshabilitado sin nombre ni correo', () => {
        renderStepper()
        expect(cta()).toBeDisabled()
    })

    it('sigue deshabilitado con nombre pero sin correo', () => {
        renderStepper()
        fireEvent.change(screen.getByLabelText('Nombre y apellido'), { target: { value: 'Ana Ruiz' } })
        fireEvent.click(screen.getByRole('checkbox'))
        expect(cta()).toBeDisabled()
    })

    it('sigue deshabilitado con correo pero sin nombre', () => {
        renderStepper()
        fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'ana@correo.com' } })
        fireEvent.click(screen.getByRole('checkbox'))
        expect(cta()).toBeDisabled()
    })

    it('se habilita con nombre + correo + confirmación de edad, y nombra al alumno', () => {
        renderStepper()
        fillMinimum()
        const button = screen.getByRole('button', { name: 'Invitar a Ana' })
        expect(button).toBeEnabled()
    })
})

describe('AddStudentStepper — canal elegido', () => {
    it('WhatsApp viene elegido y muestra el mensaje de ESA persona', () => {
        renderStepper({ persona: 'endurance' })
        fillMinimum('Javiera Soto', 'javi@correo.com')
        const [whatsapp] = screen.getAllByRole('radio')
        expect(whatsapp).toBeChecked()
        const expected = PERSONA_COPY.endurance.whatsappInvite
            .split('{nombre}')
            .join('Javiera')
            .split('{link}')
            .join('https://www.eva-app.cl/c/AB3KP/login')
        expect(screen.getByText(expected)).toBeInTheDocument()
    })

    it('elegir «Por correo» cambia el canal y muestra la clave temporal', () => {
        renderStepper()
        const [, email] = screen.getAllByRole('radio')
        fireEvent.click(email)
        expect(email).toBeChecked()
        expect(screen.getByText(/la cambia al entrar/i)).toBeInTheDocument()
    })

    it('elegir «En persona» muestra el código del coach', () => {
        renderStepper()
        const [, , code] = screen.getAllByRole('radio')
        fireEvent.click(code)
        expect(code).toBeChecked()
        expect(screen.getByText('AB3KP')).toBeInTheDocument()
    })
})

describe('AddStudentStepper — vista previa del alumno', () => {
    it('pinta la marca del coach y el sello «Hecho con EVA» en Free', () => {
        renderStepper()
        expect(screen.getAllByText('JP Coaching').length).toBeGreaterThan(0)
        expect(screen.getByText(/Hecho con EVA/i)).toBeInTheDocument()
    })

    it('Pro no lleva sello', () => {
        renderStepper({
            brand: { name: 'JP Coaching', logoUrl: null, primaryColor: '#1462DC', showsEvaBadge: false },
        })
        expect(screen.queryByText(/Hecho con EVA/i)).not.toBeInTheDocument()
    })

    it('con contenido ya armado lo muestra; sin contenido dice cuándo aparece', () => {
        const { unmount } = renderStepper({
            firstContent: { programName: 'Full body 3 días', demoName: 'Matías' },
        })
        expect(screen.getByText('Full body 3 días')).toBeInTheDocument()
        unmount()

        renderStepper()
        expect(screen.getByText(/Su rutina aparece acá cuando se la asignes/i)).toBeInTheDocument()
    })
})
