import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NAV_MODULES, type NavModule } from '@eva/coach-nav'
import { CoachMoreSheetBody } from './CoachMoreSheet'

/**
 * W2.6 (Ola de orden) — contrato de la hoja «Más» de la cápsula móvil WEB.
 *
 * Lo que se protege es la REGLA, no el pixel: que el overflow de `buildMobileBar` se reparta en
 * «Tu trabajo» / «Gestión» con `groupNavItems`, que una sección sin filas NO se pinte (ni su
 * encabezado — el bug que dejaba encabezados huérfanos en el sidebar antes de W2.4) y que la fila
 * de la ruta actual quede marcada. El chasis del `Sheet` (portal de base-ui) queda fuera a
 * propósito: se testea el CUERPO, que es donde vive la lógica.
 *
 * QA del owner 01-09 (ronda 2): la hoja cierra con «Cerrar sesión» — en móvil era la única salida
 * que no estaba a mano. Es lo único que no sale del registro de nav, así que se prueba aparte.
 */

/** El hook real toca Supabase/PostHog/Sentry: acá interesa que la fila EXISTA y dispare la acción. */
const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }))
vi.mock('@/app/coach/settings/_components/CoachSignOut', () => ({
    useCoachSignOut: () => ({ signOut: signOutMock, pending: false }),
}))

/** Items reales del registro por key — nada de fixtures inventados. */
function pick(...keys: string[]): NavModule[] {
    return keys.map((key) => {
        const item = NAV_MODULES.find((candidate) => candidate.key === key)
        if (!item) throw new Error(`key inexistente en NAV_MODULES: ${key}`)
        return item
    })
}

const noop = vi.fn()

describe('CoachMoreSheetBody (W2.6)', () => {
    it('overflow completo: pinta las DOS secciones con sus filas', () => {
        // El sobrante típico de un coach standalone strength: la barra se llevó Inicio, Alumnos,
        // Programas y Nutrición, y todo lo demás cae acá.
        const items = pick('cardio', 'movement', 'team', 'funciones', 'options', 'support')
        render(<CoachMoreSheetBody items={items} pathname="/coach/dashboard" onNavigate={noop} />)

        expect(screen.getByRole('heading', { name: 'Tu trabajo' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Gestión' })).toBeInTheDocument()

        for (const label of ['Cardio', 'Movimiento', 'Equipo', 'Funciones', 'Opciones', 'Soporte']) {
            expect(screen.getByRole('link', { name: new RegExp(`^${label}`) })).toBeInTheDocument()
        }
    })

    it('cada fila lleva el href del registro y su subtítulo', () => {
        const items = pick('cardio', 'options')
        render(<CoachMoreSheetBody items={items} pathname="/coach/dashboard" onNavigate={noop} />)

        expect(screen.getByTestId('coach-more-cardio')).toHaveAttribute('href', '/coach/cardio')
        expect(screen.getByTestId('coach-more-options')).toHaveAttribute('href', '/coach/settings')
        // Subtítulos VERBATIM de la hoja de RN: el coach no puede leer una cosa en la app y otra
        // en la PWA.
        expect(screen.getByText('Zonas, pace e intervalos')).toBeInTheDocument()
        expect(screen.getByText('Marca, plan y cuenta')).toBeInTheDocument()
    })

    it('overflow solo de gestión: «Tu trabajo» no se pinta (ni su encabezado)', () => {
        // Coach que apagó Cardio y Movimiento: sus 2 dominios prendidos entraron en la barra y a
        // la hoja solo llega gestión.
        const items = pick('funciones', 'options', 'support')
        render(<CoachMoreSheetBody items={items} pathname="/coach/dashboard" onNavigate={noop} />)

        expect(screen.queryByRole('heading', { name: 'Tu trabajo' })).toBeNull()
        expect(screen.getByRole('heading', { name: 'Gestión' })).toBeInTheDocument()
        expect(screen.getByTestId('coach-more-support')).toBeInTheDocument()
    })

    it('overflow vacío: no se pinta ninguna sección', () => {
        // Status bloqueado: `buildMobileBar` devuelve solo «Reactivar» y overflow vacío.
        render(<CoachMoreSheetBody items={[]} pathname="/coach/reactivate" onNavigate={noop} />)

        expect(screen.queryByRole('heading', { name: 'Tu trabajo' })).toBeNull()
        expect(screen.queryByRole('heading', { name: 'Gestión' })).toBeNull()
        expect(screen.queryAllByRole('link')).toHaveLength(0)
    })

    it('la fila de la ruta actual queda activa (clase de activo + aria-current); las demás no', () => {
        const items = pick('cardio', 'movement', 'options')
        // Subruta, no match exacto: `isNavItemActiveForPath` usa prefijo.
        render(<CoachMoreSheetBody items={items} pathname="/coach/cardio/zonas" onNavigate={noop} />)

        const cardio = screen.getByTestId('coach-more-cardio')
        expect(cardio.className).toContain('bg-[var(--sport-100)]')
        expect(cardio.className).toContain('text-[var(--sport-600)]')
        expect(cardio).toHaveAttribute('aria-current', 'page')

        const movement = screen.getByTestId('coach-more-movement')
        expect(movement.className).not.toContain('bg-[var(--sport-100)]')
        expect(movement).not.toHaveAttribute('aria-current')
    })

    it('nutrición se ilumina también por su alias de canary (/coach/nutrition-v2)', () => {
        const items = pick('nutrition', 'options')
        render(<CoachMoreSheetBody items={items} pathname="/coach/nutrition-v2" onNavigate={noop} />)

        expect(screen.getByTestId('coach-more-nutrition')).toHaveAttribute('aria-current', 'page')
    })

    it('la hoja cierra con «Cerrar sesión» y el tap dispara el signOut', () => {
        render(<CoachMoreSheetBody items={pick('options')} pathname="/coach/dashboard" onNavigate={noop} />)

        const row = screen.getByRole('button', { name: /Cerrar sesión/ })
        expect(row).toBeInTheDocument()
        // Tono danger del DS: es la única fila que no navega.
        expect(row.className).toContain('text-[var(--danger-600)]')

        row.click()
        expect(signOutMock).toHaveBeenCalledTimes(1)
    })

    it('«Cerrar sesión» está incluso sin overflow: en móvil es la única salida a mano', () => {
        render(<CoachMoreSheetBody items={[]} pathname="/coach/dashboard" onNavigate={noop} />)

        expect(screen.getByTestId('coach-more-signout')).toBeInTheDocument()
    })

    it('el tap en una fila avisa para cerrar la hoja', () => {
        const onNavigate = vi.fn()
        render(
            // El wrapper corta el default del <a> DESPUÉS de que corre el handler de la fila
            // (target antes que ancestro): la aserción es real y jsdom no intenta navegar.
            <div onClick={(event) => event.preventDefault()}>
                <CoachMoreSheetBody items={pick('support')} pathname="/coach/dashboard" onNavigate={onNavigate} />
            </div>,
        )

        screen.getByTestId('coach-more-support').click()

        expect(onNavigate).toHaveBeenCalledTimes(1)
    })
})
