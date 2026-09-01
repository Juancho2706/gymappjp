import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DOMAIN_ENABLED_KEY } from '@eva/feature-prefs'
import type { DomainFuncionesConfig } from '../_data/funciones.queries'

/**
 * «Opciones › Funciones» — el pane standalone (Ola de orden W3.1, decisión 5A).
 *
 * El pane es un Server Component async: se lo invoca como función y se renderiza el árbol que
 * devuelve. Sus lecturas y sus componentes pesados van mockeados; lo que se prueba acá es lo que
 * este archivo aporta: el ORDEN de la pantalla (el detalle de nutrición y la vuelta a la guía van
 * ENTRE las áreas y el alumno de ejemplo, vía el slot `afterDomains`) y que las filas de área
 * bajen resueltas fail-open junto con los alumnos del picker de Composición.
 *
 * El comportamiento del botón «Abrir» vive en `DomainsCard.test.tsx`, al lado de su componente.
 */

vi.mock('../_data/mi-panel.queries', () => ({
    getMiPanelContext: vi.fn().mockResolvedValue({
        persona: 'nutrition',
        alsoOther: false,
        demoClientId: 'demo-1',
    }),
}))
vi.mock('../_data/bodycomp-clients.queries', () => ({
    getBodycompClients: vi.fn().mockResolvedValue([
        { id: 'c-1', full_name: 'Ana' },
        { id: 'c-2', full_name: 'Beto' },
    ]),
}))
vi.mock('../_data/funciones.queries', () => ({
    domainsWithSectionEditor: vi.fn((domains: unknown[]) => domains),
}))
vi.mock('@/components/coach/FeaturePrefsPanel', () => ({
    FeaturePrefsPanel: () => <div data-testid="feature-prefs" />,
}))
vi.mock('./MiPanelClient', () => ({
    // Espeja el orden real: el slot `afterDomains` cae DESPUÉS de las áreas y ANTES del demo.
    MiPanelClient: ({
        domains,
        bodycompClients,
        afterDomains,
    }: {
        domains: { domain: string; enabled: boolean }[]
        bodycompClients: { id: string }[]
        afterDomains?: React.ReactNode
    }) => (
        <div
            data-testid="mi-panel-client"
            data-domains={domains.map((d) => `${d.domain}:${d.enabled}`).join(',')}
            data-clients={bodycompClients.length}
        >
            {afterDomains}
        </div>
    ),
}))

import { MiPanelPane } from './MiPanelPane'

function domain(name: string, enabled?: boolean): DomainFuncionesConfig {
    return {
        domain: name,
        label: name,
        description: `pitch de ${name}`,
        sections: [],
        preset: 'basico',
        sectionPrefs: enabled == null ? {} : { [DOMAIN_ENABLED_KEY]: enabled },
        entitledByModule: {},
    } as unknown as DomainFuncionesConfig
}

async function renderPane(domains: DomainFuncionesConfig[] = []) {
    const tree = await MiPanelPane({ domains })
    return render(tree)
}

describe('MiPanelPane', () => {
    it('ofrece volver a la guía de inicio con un link a /coach/guia', async () => {
        await renderPane()
        const link = screen.getByRole('link', { name: /Ver mi guía de inicio/ })
        expect(link.getAttribute('href')).toBe('/coach/guia')
    })

    it('el copy aclara que sirve aunque la guía esté terminada o cerrada', async () => {
        await renderPane()
        expect(screen.getByText(/Aunque ya la hayas terminado o cerrado/)).toBeTruthy()
    })

    it('sigue montando el resto del pane', async () => {
        await renderPane()
        expect(screen.getByTestId('mi-panel-client')).toBeTruthy()
    })

    it('el detalle de nutrición y la guía van DENTRO del slot, entre áreas y alumno de ejemplo', async () => {
        await renderPane([domain('nutrition')])
        const client = screen.getByTestId('mi-panel-client')
        expect(client.querySelector('[data-testid="feature-prefs"]')).toBeTruthy()
        expect(client.querySelector('a[href="/coach/guia"]')).toBeTruthy()
    })

    it('resuelve el master switch fail-open: sin `_enabled` el área está prendida', async () => {
        await renderPane([domain('cardio'), domain('movement', false), domain('bodycomp', true)])
        expect(screen.getByTestId('mi-panel-client').getAttribute('data-domains')).toBe(
            'cardio:true,movement:false,bodycomp:true',
        )
    })

    it('baja los alumnos del workspace para el picker de Composición', async () => {
        await renderPane([domain('bodycomp')])
        expect(screen.getByTestId('mi-panel-client').getAttribute('data-clients')).toBe('2')
    })
})
