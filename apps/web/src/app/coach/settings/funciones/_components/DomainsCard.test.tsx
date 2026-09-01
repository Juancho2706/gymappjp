import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { MiPanelDomainRow } from './DomainsCard'

/**
 * «Qué se ve en tu panel» — el botón «Abrir» de cada área (Ola de orden W3.1, decisión 6A).
 *
 * Lo que se protege: el «Abrir» aparece SOLO con el área prendida (un área apagada no está en el
 * menú: ofrecer su puerta sería mentir), va al destino del mapa puro, y en Composición corporal
 * —que no tiene pantalla propia— abre el selector de alumno en vez de navegar.
 *
 * El picker va mockeado a propósito: su Dialog/Sheet depende de `matchMedia` y ya se prueba como
 * unidad aparte; acá interesa el CABLEADO (el botón lo abre).
 */

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('../_actions/mi-panel.actions', () => ({
    setMiPanelDomainAction: vi.fn().mockResolvedValue({ ok: true, message: 'Listo, ya se ve.' }),
}))
vi.mock('./BodycompClientPicker', () => ({
    BodycompClientPicker: ({ open }: { open: boolean }) =>
        open ? <div data-testid="bodycomp-picker" /> : null,
}))

import { DomainsCard } from './DomainsCard'

function row(domain: string, enabled: boolean): MiPanelDomainRow {
    return {
        domain,
        label: `Área ${domain}`,
        description: `pitch de ${domain}`,
        enabled,
    } as MiPanelDomainRow
}

describe('DomainsCard', () => {
    it('muestra «Abrir» solo en las áreas prendidas', () => {
        render(
            <DomainsCard
                domains={[row('cardio', true), row('movement', false)]}
                bodycompClients={[]}
            />,
        )
        const open = screen.getAllByRole('link', { name: /Abrir/ })
        expect(open).toHaveLength(1)
        expect(open[0].getAttribute('href')).toBe('/coach/cardio')
    })

    it('cada área prendida lleva a su pantalla', () => {
        render(
            <DomainsCard
                domains={[row('training', true), row('nutrition', true)]}
                bodycompClients={[]}
            />,
        )
        const hrefs = screen
            .getAllByRole('link', { name: /Abrir/ })
            .map((el) => el.getAttribute('href'))
        expect(hrefs).toEqual(['/coach/workout-programs', '/coach/nutrition-v2'])
    })

    it('Composición corporal abre el selector de alumno en vez de navegar', () => {
        render(<DomainsCard domains={[row('bodycomp', true)]} bodycompClients={[]} />)
        expect(screen.queryByRole('link', { name: /Abrir/ })).toBeNull()
        expect(screen.queryByTestId('bodycomp-picker')).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /Abrir/ }))
        expect(screen.getByTestId('bodycomp-picker')).toBeTruthy()
    })

    it('en standalone cada fila trae su master switch', () => {
        render(<DomainsCard domains={[row('cardio', true)]} bodycompClients={[]} />)
        expect(screen.getAllByRole('switch')).toHaveLength(1)
    })

    it('en team (solo lectura) no hay switch por fila pero el «Abrir» sigue', () => {
        render(
            <DomainsCard domains={[row('cardio', true)]} bodycompClients={[]} editable={false} />,
        )
        expect(screen.getByRole('link', { name: /Abrir/ })).toBeTruthy()
        expect(screen.queryByRole('switch')).toBeNull()
    })

    it('pinta el pitch de cada área (el catálogo que absorbió de Módulos)', () => {
        render(<DomainsCard domains={[row('cardio', true)]} bodycompClients={[]} />)
        expect(screen.getByText('pitch de cardio')).toBeTruthy()
    })
})
