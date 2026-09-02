import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { FeatureDomain } from '@eva/feature-prefs'
import type { MiPanelDomainRow } from './DomainsCard'

/**
 * «Qué se ve en tu panel» — el botón «Abrir» de cada área (Ola de orden W3.1, decisión 6A) y, desde
 * el QA del owner 01-09 (ronda 2), el ORDEN editable (▲▼) y el switch del POOL para gestores.
 *
 * Lo que se protege:
 *  - el «Abrir» aparece SOLO con el área prendida (un área apagada no está en el menú: ofrecer su
 *    puerta sería mentir), va al destino del mapa puro, y en Composición corporal —que no tiene
 *    pantalla propia— abre el selector de alumno en vez de navegar;
 *  - las filas se pintan en el orden GUARDADO por el coach (fila `_nav`) y, sin él, en el de su
 *    especialidad; ▲/▼ se deshabilitan en los bordes y escriben por `setNavOrderAction`;
 *  - en team el switch existe SOLO para el gestor y escribe por `setTeamDomainAction` (la fila del
 *    pool no se toca con la action del coach standalone).
 *
 * El picker va mockeado a propósito: su Dialog/Sheet depende de `matchMedia` y ya se prueba como
 * unidad aparte; acá interesa el CABLEADO (el botón lo abre).
 */

const { setMiPanelDomainActionMock, setNavOrderActionMock, setTeamDomainActionMock } = vi.hoisted(() => ({
    setMiPanelDomainActionMock: vi.fn(),
    setNavOrderActionMock: vi.fn(),
    setTeamDomainActionMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('../_actions/mi-panel.actions', () => ({
    setMiPanelDomainAction: setMiPanelDomainActionMock,
    setNavOrderAction: setNavOrderActionMock,
    setTeamDomainAction: setTeamDomainActionMock,
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

/** Los cinco dominios, en el orden pedido — lo que devuelve `resolveNavOrder` en producción. */
function rows(...domains: FeatureDomain[]): MiPanelDomainRow[] {
    return domains.map((domain) => row(domain, true))
}

/** Las filas pintadas, en el orden en que se ven (el `label` es `Área <domain>`). */
function paintedOrder(): string[] {
    return screen.getAllByRole('button', { name: /^Subir / }).map((el) => el.getAttribute('aria-label')!.replace('Subir Área ', ''))
}

beforeEach(() => {
    vi.clearAllMocks()
    setMiPanelDomainActionMock.mockResolvedValue({ ok: true, message: 'Listo, ya se ve.' })
    setNavOrderActionMock.mockResolvedValue({ ok: true, message: 'Listo, cambiamos el orden.' })
    setTeamDomainActionMock.mockResolvedValue({ ok: true, message: 'Listo, lo ocultamos.' })
})

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

    it('en team SIN gestión no hay switch por fila pero el «Abrir» sigue', () => {
        render(
            <DomainsCard domains={[row('cardio', true)]} bodycompClients={[]} scope="team" teamId="t-1" />,
        )
        expect(screen.getByRole('link', { name: /Abrir/ })).toBeTruthy()
        expect(screen.queryByRole('switch')).toBeNull()
    })

    it('pinta el pitch de cada área (el catálogo que absorbió de Módulos)', () => {
        render(<DomainsCard domains={[row('cardio', true)]} bodycompClients={[]} />)
        expect(screen.getByText('pitch de cardio')).toBeTruthy()
    })
})

// ── Orden editable (QA del owner 01-09, ronda 2) ─────────────────────────────────────────────

describe('DomainsCard — orden de la barra', () => {
    it('sin orden guardado manda la especialidad', () => {
        // `nutrition` ⇒ PERSONA_DOMAIN_ORDER: nutrition, bodycomp, training, cardio, movement.
        render(
            <DomainsCard
                domains={rows('training', 'nutrition', 'cardio', 'movement', 'bodycomp')}
                bodycompClients={[]}
                persona="nutrition"
            />,
        )
        expect(paintedOrder()).toEqual(['nutrition', 'bodycomp', 'training', 'cardio', 'movement'])
    })

    it('el orden GUARDADO gana sobre la especialidad', () => {
        render(
            <DomainsCard
                domains={rows('training', 'nutrition', 'cardio', 'movement', 'bodycomp')}
                bodycompClients={[]}
                persona="nutrition"
                navOrder={['cardio', 'movement', 'nutrition', 'training', 'bodycomp']}
            />,
        )
        expect(paintedOrder()).toEqual(['cardio', 'movement', 'nutrition', 'training', 'bodycomp'])
    })

    it('▲ deshabilitado en la primera fila y ▼ en la última', () => {
        render(
            <DomainsCard
                domains={rows('training', 'nutrition', 'cardio', 'movement', 'bodycomp')}
                bodycompClients={[]}
                navOrder={['training', 'nutrition', 'cardio', 'movement', 'bodycomp']}
            />,
        )
        expect(screen.getByRole('button', { name: 'Subir Área training' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Bajar Área training' })).not.toBeDisabled()
        expect(screen.getByRole('button', { name: 'Subir Área bodycomp' })).not.toBeDisabled()
        expect(screen.getByRole('button', { name: 'Bajar Área bodycomp' })).toBeDisabled()
    })

    it('▲ mueve la fila al instante y guarda el orden completo', async () => {
        render(
            <DomainsCard
                domains={rows('training', 'nutrition', 'cardio', 'movement', 'bodycomp')}
                bodycompClients={[]}
                navOrder={['training', 'nutrition', 'cardio', 'movement', 'bodycomp']}
            />,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Subir Área cardio' }))

        // Optimista: la lista ya se movió antes de que la action resuelva.
        expect(paintedOrder()).toEqual(['training', 'cardio', 'nutrition', 'movement', 'bodycomp'])
        expect(setNavOrderActionMock).toHaveBeenCalledWith({
            order: ['training', 'cardio', 'nutrition', 'movement', 'bodycomp'],
        })
    })

    // QA del owner 02-09 (OB5): «Ordenar mi panel según mi especialidad» guardaba bien pero la
    // lista de abajo seguía en el orden viejo hasta recargar — el `useState` inicializaba una vez
    // y después ignoraba las props. El padre ahora refresca; la tarjeta tiene que obedecer.
    it('un orden NUEVO del servidor repinta la lista sin recargar', () => {
        const { rerender } = render(
            <DomainsCard
                domains={rows('training', 'nutrition', 'cardio', 'movement', 'bodycomp')}
                bodycompClients={[]}
                navOrder={['training', 'nutrition', 'cardio', 'movement', 'bodycomp']}
            />,
        )
        expect(paintedOrder()).toEqual(['training', 'nutrition', 'cardio', 'movement', 'bodycomp'])

        rerender(
            <DomainsCard
                domains={rows('training', 'nutrition', 'cardio', 'movement', 'bodycomp')}
                bodycompClients={[]}
                navOrder={['cardio', 'bodycomp', 'training', 'nutrition', 'movement']}
            />,
        )
        expect(paintedOrder()).toEqual(['cardio', 'bodycomp', 'training', 'nutrition', 'movement'])
    })

    // El mismo checkbox también prende y apaga áreas (`writePersonaDomainPrefs`): los switches
    // tenían el mismo estado congelado que el orden.
    it('unas áreas NUEVAS del servidor repintan los switches sin recargar', () => {
        const { rerender } = render(
            <DomainsCard domains={[row('cardio', true)]} bodycompClients={[]} />,
        )
        expect(screen.getByRole('switch')).toBeChecked()

        rerender(<DomainsCard domains={[row('cardio', false)]} bodycompClients={[]} />)
        expect(screen.getByRole('switch')).not.toBeChecked()
    })

    it('el ▲▼ también está en team: la barra es del coach, no del pool', () => {
        render(
            <DomainsCard
                domains={rows('training', 'nutrition')}
                bodycompClients={[]}
                scope="team"
                teamId="t-1"
            />,
        )
        expect(screen.getByRole('button', { name: 'Bajar Área training' })).toBeInTheDocument()
    })
})

// ── Switch del POOL para gestores (QA del owner 01-09, ronda 2) ──────────────────────────────

describe('DomainsCard — master switch del equipo', () => {
    it('en team con gestión la fila vuelve a tener switch y escribe la fila del POOL', () => {
        render(
            <DomainsCard
                domains={[row('cardio', true)]}
                bodycompClients={[]}
                scope="team"
                teamId="team-1"
                canManage
            />,
        )

        const toggle = screen.getByRole('switch')
        expect(toggle).toBeInTheDocument()

        fireEvent.click(toggle)

        expect(setTeamDomainActionMock).toHaveBeenCalledWith({
            teamId: 'team-1',
            domain: 'cardio',
            enabled: false,
        })
        // La action del coach standalone NUNCA se usa para el pool.
        expect(setMiPanelDomainActionMock).not.toHaveBeenCalled()
    })

    it('en standalone el switch sigue escribiendo las prefs del coach', () => {
        render(<DomainsCard domains={[row('cardio', true)]} bodycompClients={[]} />)

        fireEvent.click(screen.getByRole('switch'))

        expect(setMiPanelDomainActionMock).toHaveBeenCalledWith({ domain: 'cardio', enabled: false })
        expect(setTeamDomainActionMock).not.toHaveBeenCalled()
    })
})
