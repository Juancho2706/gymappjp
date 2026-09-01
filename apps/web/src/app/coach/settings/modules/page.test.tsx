import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W3.2 (Ola de orden) — `/coach/settings/modules` es un redirect a Funciones.
 *
 * La ruta se conserva porque hay links vivos afuera del repo (correos, guías, marcadores). Lo que
 * este test protege es que siga siendo SOLO un redirect: si alguien vuelve a colgar UI acá, el
 * catálogo queda otra vez en dos lugares — el desorden que W3 fue a matar.
 */

const redirect = vi.fn()

vi.mock('next/navigation', () => ({
    redirect: (...args: unknown[]) => redirect(...args),
}))

import CoachModulesRedirectPage from './page'

describe('CoachModulesRedirectPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('redirige a /coach/settings/funciones', () => {
        // La page es un `never` para TS (el redirect corta el flujo): se la invoca dentro de un
        // closure para que las aserciones de abajo sigan siendo alcanzables.
        expect(() => CoachModulesRedirectPage()).not.toThrow()
        expect(redirect).toHaveBeenCalledTimes(1)
        expect(redirect).toHaveBeenCalledWith('/coach/settings/funciones')
    })
})
