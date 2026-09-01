import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W3.2 (Ola de orden) — `/coach/tools` es un redirect a Funciones.
 *
 * El launcher «Herramientas» dejó de existir: cada área prendida tiene su botón «Abrir» dentro de
 * Funciones. La ruta queda por los links vivos afuera del repo; este test protege que no vuelva a
 * crecerle UI propia.
 */

const redirect = vi.fn()

vi.mock('next/navigation', () => ({
    redirect: (...args: unknown[]) => redirect(...args),
}))

import CoachToolsRedirectPage from './page'

describe('CoachToolsRedirectPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('redirige a /coach/settings/funciones', () => {
        // La page es un `never` para TS (el redirect corta el flujo): se la invoca dentro de un
        // closure para que las aserciones de abajo sigan siendo alcanzables.
        expect(() => CoachToolsRedirectPage()).not.toThrow()
        expect(redirect).toHaveBeenCalledTimes(1)
        expect(redirect).toHaveBeenCalledWith('/coach/settings/funciones')
    })
})
