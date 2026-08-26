import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

/**
 * Nav del alumno en sesión de EJEMPLO (docs/specs/vive-tu-app-directo §3, V2.6).
 *
 * El coach que está mirando su app ve «Cerrar sesión» y lo toca: es el gesto obvio para salir. En
 * modo `return` eso QUEMA el camino de vuelta (borra la sesión sin consumir el magic link y la
 * cookie queda huérfana). Por eso el mismo botón se reetiqueta y hace lo correcto.
 */

vi.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: { signOut: vi.fn() } }),
}))

import { ClientNav } from './ClientNav'

function markup(demoMode: 'rn' | 'return' | 'remote' | null) {
    return renderToStaticMarkup(
        <ClientNav
            coachSlug="studio-fuerza-qa"
            basePath="/c/studio-fuerza-qa"
            coachBrand="Studio Fuerza"
            coachLogoUrl="/icon.png"
            demoMode={demoMode}
        />,
    )
}

describe('ClientNav — vista de ejemplo', () => {
    it('alumno real: el botón sigue diciendo «Cerrar sesión»', () => {
        const html = markup(null)
        expect(html).toContain('Cerrar sesión')
        expect(html).not.toContain('Volver a mi panel')
    })

    it('modo `return`: «Volver a mi panel»', () => {
        const html = markup('return')
        expect(html).toContain('Volver a mi panel')
        expect(html).not.toContain('Cerrar sesión')
    })

    it('modo `rn`: «Salir de la vista de ejemplo» (la vuelta la resuelve la app)', () => {
        const html = markup('rn')
        expect(html).toContain('Salir de la vista de ejemplo')
        expect(html).not.toContain('Cerrar sesión')
    })

    it('modo `remote`: «Salir de la vista de ejemplo»', () => {
        const html = markup('remote')
        expect(html).toContain('Salir de la vista de ejemplo')
        expect(html).not.toContain('Volver a mi panel')
    })
})
