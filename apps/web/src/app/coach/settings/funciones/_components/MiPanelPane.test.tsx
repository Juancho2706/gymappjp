import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * «Opciones › Mi panel» — el camino de vuelta a la guía (QA del owner 22-08).
 *
 * El pane es un Server Component async: se lo invoca como función y se renderiza el árbol que
 * devuelve. Sus dos lecturas y sus dos componentes pesados van mockeados — lo que se prueba es
 * la entrada nueva a `/coach/guia`, que es lo único que este archivo aporta.
 */

vi.mock('../_data/mi-panel.queries', () => ({
    getMiPanelContext: vi.fn().mockResolvedValue({
        persona: 'nutrition',
        alsoOther: false,
        demoClientId: 'demo-1',
    }),
}))
vi.mock('../_data/funciones.queries', () => ({
    domainsWithSectionEditor: vi.fn().mockReturnValue([]),
}))
vi.mock('./MiPanelClient', () => ({
    MiPanelClient: () => <div data-testid="mi-panel-client" />,
}))
vi.mock('@/components/coach/FeaturePrefsPanel', () => ({
    FeaturePrefsPanel: () => <div data-testid="feature-prefs" />,
}))

import { MiPanelPane } from './MiPanelPane'

async function renderPane() {
    const tree = await MiPanelPane({ domains: [] })
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
})
