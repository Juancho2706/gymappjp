import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const WEAK_PASSWORD_ES =
    'Esta contraseña aparece en filtraciones de datos de internet, por lo que es fácil de adivinar. Elige una distinta: evita nombres conocidos, fechas o palabras comunes.'

const { createClientActionMock, phCapture, generatePasswordMock } = vi.hoisted(() => ({
    createClientActionMock: vi.fn(),
    phCapture: vi.fn(),
    generatePasswordMock: vi.fn(),
}))

vi.mock('./_actions/clients.actions', () => ({ createClientAction: createClientActionMock }))
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: phCapture }) }))
vi.mock('@/lib/posthog/events', () => ({ useCaptureUpgradeGate: () => vi.fn() }))
vi.mock('@/lib/auth/temp-credentials', () => ({ generateStudentTempPassword: generatePasswordMock }))

import { CreateClientModal } from './CreateClientModal'

beforeEach(() => {
    createClientActionMock.mockReset()
    phCapture.mockClear()
    // Secuencia determinística: 1.ª llamada = apertura, 2.ª = «Generar otra clave».
    generatePasswordMock.mockReset()
    generatePasswordMock
        .mockReturnValueOnce('Eva111111!')
        .mockReturnValueOnce('Eva222222!')
        .mockReturnValue('Eva333333!')
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

/**
 * La clave temporal llega pre-generada (`Eva${pin}!`) para que el coach no invente una que HIBP
 * rechace. Sigue editable y se puede re-sortear.
 */
describe('CreateClientModal — clave temporal pre-generada', () => {
    it('al abrir, el campo trae una clave con el formato Eva + 6 dígitos + !', async () => {
        const actual = await vi.importActual<typeof import('@/lib/auth/temp-credentials')>(
            '@/lib/auth/temp-credentials'
        )
        generatePasswordMock.mockReset()
        generatePasswordMock.mockImplementation(actual.generateStudentTempPassword)
        render(<CreateClientModal open onClose={vi.fn()} />)

        const password = screen.getByLabelText('Contraseña temporal') as HTMLInputElement
        expect(password.value).toMatch(/^Eva\d{6}!$/)
    })

    it('«Generar otra clave» cambia el valor del campo', () => {
        render(<CreateClientModal open onClose={vi.fn()} />)

        const password = screen.getByLabelText('Contraseña temporal') as HTMLInputElement
        expect(password.value).toBe('Eva111111!')

        fireEvent.click(screen.getByRole('button', { name: 'Generar otra clave' }))
        expect(password.value).toBe('Eva222222!')
    })

    it('se re-sortea al volver a abrir el modal (no se desmonta entre aperturas)', () => {
        const { rerender } = render(<CreateClientModal open onClose={vi.fn()} />)
        const password = screen.getByLabelText('Contraseña temporal') as HTMLInputElement
        expect(password.value).toBe('Eva111111!')

        rerender(<CreateClientModal open={false} onClose={vi.fn()} />)
        rerender(<CreateClientModal open onClose={vi.fn()} />)
        expect((screen.getByLabelText('Contraseña temporal') as HTMLInputElement).value).toBe('Eva222222!')
    })

    it('envía en el FormData el valor del campo: el generado, o el editado por el coach', async () => {
        createClientActionMock.mockResolvedValue({ error: WEAK_PASSWORD_ES, code: 'weak_password' })
        render(<CreateClientModal open onClose={vi.fn()} />)

        fireEvent.change(screen.getByLabelText('Nombre completo'), { target: { value: 'Alumna Prueba' } })
        fireEvent.change(screen.getByLabelText('Email del alumno'), { target: { value: 'alumna@correo.com' } })
        fireEvent.click(screen.getByRole('checkbox'))
        const password = screen.getByLabelText('Contraseña temporal') as HTMLInputElement

        // 1) Tal cual llegó generada.
        fireEvent.click(screen.getByRole('button', { name: /Crear Alumno/i }))
        expect(await screen.findByText(WEAK_PASSWORD_ES)).toBeInTheDocument()
        expect((createClientActionMock.mock.calls[0][1] as FormData).get('temp_password')).toBe('Eva111111!')
        // Tras el rechazo NO se re-sortea: el coach ve la misma clave que envió.
        expect(password.value).toBe('Eva111111!')

        // 2) Editada a mano.
        fireEvent.change(password, { target: { value: 'MiClaveNueva9' } })
        fireEvent.click(screen.getByRole('button', { name: /Crear Alumno/i }))
        await vi.waitFor(() => expect(createClientActionMock).toHaveBeenCalledTimes(2))
        expect((createClientActionMock.mock.calls[1][1] as FormData).get('temp_password')).toBe('MiClaveNueva9')
    })
})
