import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const WEAK_PASSWORD_ES =
    'Esta contraseña aparece en filtraciones de datos de internet, por lo que es fácil de adivinar. Elige una distinta: evita nombres conocidos, fechas o palabras comunes.'

const { createClientActionMock, phCapture } = vi.hoisted(() => ({
    createClientActionMock: vi.fn(),
    phCapture: vi.fn(),
}))

vi.mock('./_actions/clients.actions', () => ({ createClientAction: createClientActionMock }))
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: phCapture }) }))
vi.mock('@/lib/posthog/events', () => ({ useCaptureUpgradeGate: () => vi.fn() }))

import { CreateClientModal } from './CreateClientModal'

beforeEach(() => {
    createClientActionMock.mockReset()
    phCapture.mockClear()
})

/**
 * Incidente Ani 2026-09-22: GoTrue rechazó la clave temporal (HIBP) y, además del banner en
 * inglés, el formulario quedó VACÍO — React 19 resetea los campos no controlados de un
 * `<form action={fn}>` al terminar la acción, haya error o no. El coach tenía que retipear todo.
 */
describe('CreateClientModal — un rechazo del server no borra lo tipeado', () => {
    it('muestra el error en español y conserva nombre, correo, clave y la casilla', async () => {
        createClientActionMock.mockResolvedValue({ error: WEAK_PASSWORD_ES, code: 'weak_password' })
        render(<CreateClientModal open onClose={vi.fn()} />)

        const name = screen.getByLabelText('Nombre completo') as HTMLInputElement
        const email = screen.getByLabelText('Email del alumno') as HTMLInputElement
        const password = screen.getByLabelText('Contraseña temporal') as HTMLInputElement
        const ageCheckbox = screen.getByRole('checkbox') as HTMLInputElement

        fireEvent.change(name, { target: { value: 'Alumna Prueba' } })
        fireEvent.change(email, { target: { value: 'alumna@correo.com' } })
        fireEvent.change(password, { target: { value: 'password123' } })
        fireEvent.click(ageCheckbox)

        fireEvent.click(screen.getByRole('button', { name: /Crear Alumno/i }))

        expect(await screen.findByText(WEAK_PASSWORD_ES)).toBeInTheDocument()
        expect(createClientActionMock).toHaveBeenCalledTimes(1)
        const sent = createClientActionMock.mock.calls[0][1] as FormData
        expect(sent.get('temp_password')).toBe('password123')
        expect(sent.get('age_confirmed')).toBe('on')

        expect(name.value).toBe('Alumna Prueba')
        expect(email.value).toBe('alumna@correo.com')
        expect(password.value).toBe('password123')
        expect(ageCheckbox.checked).toBe(true)
        // El texto crudo de GoTrue ya no llega a pintarse.
        expect(screen.queryByText(/Password is known/i)).not.toBeInTheDocument()
    })
})
