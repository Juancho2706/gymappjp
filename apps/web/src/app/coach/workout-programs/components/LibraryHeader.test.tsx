import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * «Nueva» ya no crea plantillas a ciegas: pregunta QUÉ crear (programa o ejercicio personalizado).
 * Acá se prueba la superficie MÓVIL (bottom sheet) porque es la que jsdom puede abrir con un click
 * real; el menú de escritorio es el mismo par de handlers sobre el mismo `choose()`.
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture: vi.fn() }) }))

import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { LibraryHeader } from './LibraryHeader'

function renderHeader(onNewTemplate = vi.fn()) {
    render(
        <LanguageProvider>
            <LibraryHeader
                templateCount={3}
                activeAssignedCount={2}
                totalCount={5}
                onNewTemplate={onNewTemplate}
            />
        </LanguageProvider>
    )
    return onNewTemplate
}

async function openMobileSheet() {
    const triggers = screen.getAllByLabelText('Crear programa o ejercicio')
    // El botón (no el trigger del menú) es el que abre el sheet: es el único <button> "sm:hidden".
    const mobile = triggers.find((el) => el.className.includes('sm:hidden'))
    expect(mobile).toBeTruthy()
    fireEvent.click(mobile!)
    await waitFor(() => expect(screen.getByText('¿Qué querés crear?')).toBeTruthy())
}

describe('LibraryHeader — «Nueva» pregunta qué crear', () => {
    beforeEach(() => {
        push.mockClear()
    })

    it('el CTA hero dice «Nueva» (ya no «Nueva plantilla»)', () => {
        renderHeader()
        expect(screen.queryByText('Nueva plantilla')).toBeNull()
        expect(screen.getAllByText('Nueva').length).toBeGreaterThan(0)
    })

    it('ofrece las dos opciones al abrir', async () => {
        renderHeader()
        await openMobileSheet()
        expect(screen.getByText('Programa nuevo')).toBeTruthy()
        expect(screen.getByText('Ejercicio personalizado')).toBeTruthy()
    })

    it('«Programa nuevo» llama a onNewTemplate', async () => {
        const onNewTemplate = renderHeader()
        await openMobileSheet()
        fireEvent.click(screen.getByText('Programa nuevo'))
        expect(onNewTemplate).toHaveBeenCalledTimes(1)
        expect(push).not.toHaveBeenCalled()
    })

    it('«Ejercicio personalizado» navega al catálogo con ?create=1', async () => {
        const onNewTemplate = renderHeader()
        await openMobileSheet()
        fireEvent.click(screen.getByText('Ejercicio personalizado'))
        expect(push).toHaveBeenCalledWith('/coach/exercises?create=1')
        expect(onNewTemplate).not.toHaveBeenCalled()
    })

    it('mantiene las entradas contextuales del header', () => {
        renderHeader()
        expect(screen.getByText('Lista de ejercicios')).toBeTruthy()
        expect(screen.getByText('Áreas del builder')).toBeTruthy()
    })
})
