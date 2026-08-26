import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * Escape del desconocido en el login de marca (flujo-coach-nuevo W2.8).
 *
 * Lo que protege: `/c/{slug}/login` es un callejón para quien todavía no es alumno —no hay registro
 * ahí— y su única salida es `/join/{código}`. El link se pinta SOLO con código: `/join/` pelado es
 * un 404, así que un coach sin `invite_code` no puede quedar con una salida rota.
 *
 * La server action se mockea: acá se ejercita el render, no el login (eso vive en
 * `_actions/login.actions.test.ts`). `next/navigation` ya viene mockeado por `vitest.setup.ts`.
 */

vi.mock('./_actions/login.actions', () => ({
    clientLoginAction: vi.fn(async () => ({})),
}))

import ClientLoginForm from './ClientLoginForm'

const BASE = {
    coachSlug: 'studio-fuerza',
    primaryColor: '#1462DC',
    brandName: 'Studio Fuerza',
    logoUrl: null,
}

/**
 * El primer render de este árbol (form + inputs + iconos) paga el transform en frío y se pasa de
 * los 5 s por defecto de vitest en máquinas cargadas. Es costo de arranque, no del componente.
 */
const RENDER_TIMEOUT_MS = 20_000

describe('ClientLoginForm — escape «¿No tienes cuenta?»', () => {
    it(
        'con invite_code pinta el escape hacia /join/{código} con la marca del coach',
        () => {
            render(<ClientLoginForm {...BASE} inviteCode="X5UD9X44" />)

            const escape = screen.getByText('¿No tienes cuenta? Pídele acceso a Studio Fuerza')
            expect(escape).toHaveAttribute('href', '/join/X5UD9X44')
        },
        RENDER_TIMEOUT_MS
    )

    it(
        'sin invite_code no pinta nada (un /join/ sin código es un 404)',
        () => {
            render(<ClientLoginForm {...BASE} inviteCode={null} />)

            expect(screen.queryByText(/No tienes cuenta/)).toBeNull()
            expect(screen.queryByText(/Pídele acceso/)).toBeNull()
        },
        RENDER_TIMEOUT_MS
    )

    it(
        'con invite_code solo-whitespace tampoco pinta nada',
        () => {
            render(<ClientLoginForm {...BASE} inviteCode="   " />)

            expect(screen.queryByText(/Pídele acceso/)).toBeNull()
        },
        RENDER_TIMEOUT_MS
    )

    it(
        'el login del alumno sigue intacto: email, contraseña y el link de recuperación',
        () => {
            render(<ClientLoginForm {...BASE} inviteCode="X5UD9X44" />)

            expect(screen.getByLabelText('Email')).toBeInTheDocument()
            expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
            expect(screen.getByText('¿Olvidaste tu contraseña?')).toHaveAttribute(
                'href',
                '/forgot-password?coach_slug=studio-fuerza'
            )
        },
        RENDER_TIMEOUT_MS
    )
})
