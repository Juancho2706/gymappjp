import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// El banner se auto-oculta en /coach/subscription|reactivate|onboarding: la ruta neutra es la que
// deja ver la recomendación, que es lo único que este test mide.
vi.mock('next/navigation', () => ({
    usePathname: () => '/coach/clients',
}))

import { OverLimitBanner } from './OverLimitBanner'

describe('OverLimitBanner — plan recomendado con cupo EFECTIVO (Pricing v3)', () => {
    it('mide el tier ACTUAL con la columna, no con la escalera: un Pro de columna 25 con 28 alumnos salta a Elite', () => {
        // Coach pre-v2: la escalera diría Pro=30 y le ofrecería su propio plan («con Pro llegas a
        // 30») cuando su fila dice 25 y por eso mismo está sobre el cupo. Con el cupo efectivo, Pro
        // queda descartado y la salida real es Elite.
        render(
            <OverLimitBanner
                activeCount={28}
                maxClients={25}
                tierLabel="Pro"
                currentTier="pro"
                coachCreatedAt="2026-01-15T10:00:00.000Z"
            />
        )
        expect(screen.getByText(/Con Elite/)).toBeTruthy()
        expect(screen.queryByText(/Con Pro/)).toBeNull()
        // Elite pre-v2 = 100 alumnos: el número prometido también sale del cupo efectivo.
        expect(screen.getByText(/100 alumnos y con los 4 módulos/)).toBeTruthy()
    })

    it('un Free v3 (columna 1) sobre cupo recibe Pro, el pago más barato que lo cubre', () => {
        render(
            <OverLimitBanner
                activeCount={3}
                maxClients={1}
                tierLabel="Free"
                currentTier="free"
                coachCreatedAt="2026-08-25T10:00:00.000Z"
            />
        )
        expect(screen.getByText(/Con Pro/)).toBeTruthy()
        expect(screen.getByText(/25 alumnos y con los 4 módulos/)).toBeTruthy()
    })

    it('jamás recomienda el gratuito ni el plan que el coach YA tiene', () => {
        // `max_clients` manual por debajo del piso del tier (cortesía recortada a mano): el único
        // camino por el que el plan más barato que "cubre" 2 alumnos sería el gratuito (pre-v2 = 3).
        render(
            <OverLimitBanner
                activeCount={2}
                maxClients={1}
                tierLabel="Pro"
                currentTier="pro"
                coachCreatedAt="2026-01-15T10:00:00.000Z"
            />
        )
        expect(screen.queryByText(/Con Gratis/)).toBeNull()
        // Pro queda fuera por ser el plan actual (recomendárselo no resuelve nada).
        expect(screen.getByText(/Con Elite/)).toBeTruthy()
    })
})
