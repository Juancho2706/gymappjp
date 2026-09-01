import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FEATURE_DOMAIN_KEYS } from '@eva/feature-prefs'
import { FUNCIONES_PATH, domainOffBannerCopy } from '@/lib/domain-off'

/**
 * Banner «dominio apagado» del dashboard (Ola de orden W1.5).
 *
 * Lo que este test pinnea:
 *  - el banner SOLO existe cuando el redirect de `assertDomainEnabled` lo pidió
 *    (`?notice=domain_off&domain=<dominio válido>`): sin query no hay ruido en el panel;
 *  - un `?domain=` basura (viene del cliente, es input no confiable) NO pinta nada — jamás copy
 *    inventado a partir de la URL;
 *  - el copy es EXACTAMENTE el compartido (`domainOffBannerCopy`), nunca texto suelto en el
 *    componente: web y RN tienen que decir lo mismo y W3 renombra la pantalla en un solo lugar;
 *  - la × lo cierra Y le saca los params a la URL con `history.replaceState` (decisión 2A: sin
 *    persistencia, pero un reload tampoco lo revive) — y NO con `router.replace`, que refetchearía
 *    el RSC del dashboard entero;
 *  - los 5 dominios tienen copy propio y renderizable (nadie queda con `undefined`).
 *
 * `vitest.setup.ts:5-16` mockea `next/navigation` para TODO el repo con un `useSearchParams` que
 * devuelve `get: vi.fn()` (siempre `undefined`). Este archivo lo re-mockea con una query
 * controlable por caso — mismo patrón que `ViveTuAppButton.test.tsx`.
 */

const { searchParams } = vi.hoisted(() => ({
    searchParams: { current: new URLSearchParams() },
}))

vi.mock('next/navigation', () => ({
    useSearchParams: () => searchParams.current,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
    usePathname: () => '/coach/dashboard',
}))

import { DomainOffBanner } from './DomainOffBanner'

function setQuery(query: string) {
    searchParams.current = new URLSearchParams(query)
}

describe('DomainOffBanner', () => {
    beforeEach(() => {
        setQuery('')
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('pinta el copy compartido y el link a Mi panel con ?notice=domain_off&domain=cardio', () => {
        setQuery('notice=domain_off&domain=cardio')
        render(<DomainOffBanner />)

        const copy = domainOffBannerCopy('cardio')
        const banner = screen.getByRole('status')
        expect(banner).toHaveTextContent(copy.title)
        expect(banner).toHaveTextContent(copy.hint)

        const cta = screen.getByRole('link', { name: copy.cta })
        expect(cta).toHaveAttribute('href', FUNCIONES_PATH)
    })

    it('no renderiza nada con un ?domain= que no es un dominio real', () => {
        setQuery('notice=domain_off&domain=workouts')
        const { container } = render(<DomainOffBanner />)

        expect(container).toBeEmptyDOMElement()
        expect(screen.queryByRole('status')).toBeNull()
    })

    it('no renderiza nada sin query (el dashboard normal no muestra el aviso)', () => {
        const { container } = render(<DomainOffBanner />)

        expect(container).toBeEmptyDOMElement()
    })

    it('la × lo cierra y limpia los params de la URL con history.replaceState', () => {
        setQuery('notice=domain_off&domain=nutrition')
        const replaceState = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})

        render(<DomainOffBanner />)
        expect(screen.getByRole('status')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }))

        expect(screen.queryByRole('status')).toBeNull()
        expect(replaceState).toHaveBeenCalledTimes(1)
        expect(replaceState).toHaveBeenCalledWith(null, '', window.location.pathname)
    })

    it.each([...FEATURE_DOMAIN_KEYS])('renderiza el aviso del dominio %s', (domain) => {
        setQuery(`notice=domain_off&domain=${domain}`)
        render(<DomainOffBanner />)

        const copy = domainOffBannerCopy(domain)
        const banner = screen.getByRole('status')
        expect(banner).toHaveTextContent(copy.title)
        expect(banner).toHaveTextContent(copy.hint)
        expect(screen.getByRole('link', { name: copy.cta })).toHaveAttribute('href', FUNCIONES_PATH)
    })
})
