import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Json } from '@/lib/database.types'

/**
 * Píldora flotante de la guía (decisión del owner 22-08): el único rastro de la guía en el panel.
 * Lo que se prueba es su CONTRATO — dónde no se pinta, qué dice, y que el minimizar/maximizar
 * sobreviva a la recarga (clave por coach en `localStorage`).
 */

const { pathnameRef, telemetryMock } = vi.hoisted(() => ({
    pathnameRef: { current: '/coach/dashboard' },
    telemetryMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/navigation', () => ({ usePathname: () => pathnameRef.current }))
vi.mock('@/app/coach/dashboard/_lib/onboarding-telemetry.client', () => ({
    postGuideEngagement: telemetryMock,
}))

import { GuidePill, REOPEN_MS, TEASER_MS } from './GuidePill'

const STORAGE_KEY = 'eva.guide-pill.v1:coach-1'

function renderPill(over: { persona?: 'strength' | 'nutrition' | null; guide?: Json; managed?: boolean } = {}) {
    return render(
        <GuidePill
            coachId="coach-1"
            persona={over.persona === undefined ? 'strength' : over.persona}
            onboardingGuide={over.guide ?? {}}
            managed={over.managed ?? false}
        />
    )
}

beforeEach(() => {
    pathnameRef.current = '/coach/dashboard'
    localStorage.clear()
    sessionStorage.clear()
    telemetryMock.mockClear()
})

describe('GuidePill — dónde se pinta', () => {
    it('se pinta en el panel', () => {
        renderPill()
        expect(screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' })).toBeTruthy()
    })

    it('NO se pinta sobre la guía misma', () => {
        pathnameRef.current = '/coach/guia'
        const { container } = renderPill()
        expect(container.innerHTML).toBe('')
    })

    it('NO se pinta en el primer ingreso ni en el builder', () => {
        pathnameRef.current = '/coach/onboarding/persona'
        expect(renderPill().container.innerHTML).toBe('')
        pathnameRef.current = '/coach/builder/abc'
        expect(renderPill().container.innerHTML).toBe('')
    })

    it('con la guía completa desaparece sola', () => {
        const { container } = renderPill({
            guide: {
                completed: {
                    profile_branding: true,
                    vive_tu_app: true,
                    first_artifact: true,
                    first_client: true,
                    aha: true,
                },
            },
        })
        expect(container.innerHTML).toBe('')
    })

    it('descartada por el coach, tampoco', () => {
        expect(renderPill({ guide: { dismissed: true } }).container.innerHTML).toBe('')
        expect(renderPill({ guide: { hidden: true } }).container.innerHTML).toBe('')
    })

    it('coach de org/team (managed) nunca la ve', () => {
        expect(renderPill({ managed: true }).container.innerHTML).toBe('')
    })
})

describe('GuidePill — qué dice', () => {
    it('muestra el progreso persistido y el siguiente paso', () => {
        renderPill({ guide: { completed: { profile_branding: true, vive_tu_app: true } } })
        expect(screen.getByText('Tu guía · 2/5')).toBeTruthy()
        // Fuerza: el paso 3 es la rutina desde plantilla.
        expect(screen.getByText(/Siguiente: Arma la rutina de Matías desde la plantilla/)).toBeTruthy()
        expect(screen.getByRole('button', { name: 'Guía de inicio, 2 de 5' })).toBeTruthy()
    })

    it('«Abrir» lleva a la guía', () => {
        renderPill()
        expect(screen.getByRole('link', { name: /Abrir/ }).getAttribute('href')).toBe('/coach/guia')
    })

    it('sin persona, el siguiente paso es elegir especialidad y apunta a esa pantalla', () => {
        renderPill({ persona: null })
        expect(screen.getByText(/Siguiente: Elige tu especialidad/)).toBeTruthy()
        expect(screen.getByRole('link', { name: /Abrir/ }).getAttribute('href')).toBe(
            '/coach/onboarding/persona'
        )
    })
})

describe('GuidePill — minimizar y maximizar', () => {
    it('la primera vez arranca expandida', () => {
        renderPill()
        const toggle = screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' })
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
        expect(screen.getByRole('link', { name: /Abrir/ })).toBeTruthy()
    })

    it('minimiza, esconde el contenido del árbol accesible y lo recuerda', () => {
        renderPill()
        fireEvent.click(screen.getByRole('button', { name: 'Minimizar la guía' }))

        const toggle = screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        expect(screen.queryByRole('link', { name: /Abrir/ })).toBeNull()
        expect(localStorage.getItem(STORAGE_KEY)).toBe('collapsed')
        expect(telemetryMock).toHaveBeenCalledWith(
            'profile_branding',
            expect.objectContaining({ widget: 'guide_pill', action: 'pill_collapse' })
        )
    })

    it('vuelve a maximizarse al tocar el círculo', () => {
        localStorage.setItem(STORAGE_KEY, 'collapsed')
        renderPill()

        const toggle = screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')

        fireEvent.click(toggle)
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
        expect(localStorage.getItem(STORAGE_KEY)).toBe('expanded')
        expect(telemetryMock).toHaveBeenCalledWith(
            'profile_branding',
            expect.objectContaining({ action: 'pill_expand' })
        )
    })

    it('el estado es POR COACH: lo colapsado de otra cuenta no la afecta', () => {
        localStorage.setItem('eva.guide-pill.v1:otro-coach', 'collapsed')
        renderPill()
        expect(
            screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' }).getAttribute('aria-expanded')
        ).toBe('true')
    })

    it('Escape la minimiza cuando el foco está en ella', () => {
        renderPill()
        const toggle = screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' })
        fireEvent.keyDown(toggle, { key: 'Escape' })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
    })

    it('la telemetría de exploración no se repite dentro de la misma sesión', () => {
        renderPill()
        fireEvent.click(screen.getByRole('button', { name: 'Minimizar la guía' }))
        fireEvent.click(screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' }))
        fireEvent.click(screen.getByRole('button', { name: 'Minimizar la guía' }))

        const collapses = telemetryMock.mock.calls.filter(
            (call) => (call[1] as { action?: string }).action === 'pill_collapse'
        )
        expect(collapses).toHaveLength(1)
    })
})

describe('GuidePill — teaser: aparece, se desliza al botón y no bloquea el nav (owner 22-08)', () => {
    const TEASE_KEY = 'eva:guide-pill-teased:coach-1'

    afterEach(() => {
        vi.useRealTimers()
    })

    it('a los ~3 s se cierra sola, sin recordarlo como «minimizada» y midiéndolo como automático', () => {
        vi.useFakeTimers()
        renderPill()
        const toggle = screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' })
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
        expect(sessionStorage.getItem(TEASE_KEY)).toBe('1')

        act(() => {
            vi.advanceTimersByTime(TEASER_MS + 50)
        })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        // El teaser NO es una decisión del coach: en la próxima sesión vuelve a aparecer.
        expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
        expect(telemetryMock).toHaveBeenCalledWith(
            'profile_branding',
            expect.objectContaining({ action: 'pill_collapse', auto: true })
        )
    })

    it('el teaser es una vez por sesión: la segunda carga arranca minimizada', () => {
        sessionStorage.setItem(TEASE_KEY, '1')
        renderPill()
        expect(
            screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' }).getAttribute('aria-expanded')
        ).toBe('false')
    })

    it('abierta a mano, espera más (6 s) antes de cerrarse sola', () => {
        sessionStorage.setItem(TEASE_KEY, '1')
        vi.useFakeTimers()
        renderPill()
        const toggle = screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' })
        fireEvent.click(toggle)
        expect(toggle.getAttribute('aria-expanded')).toBe('true')

        act(() => {
            vi.advanceTimersByTime(TEASER_MS + 50)
        })
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
        act(() => {
            vi.advanceTimersByTime(REOPEN_MS)
        })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
    })

    it('minimizar a mano cancela el reloj y sí se recuerda', () => {
        vi.useFakeTimers()
        renderPill()
        fireEvent.click(screen.getByRole('button', { name: 'Minimizar la guía' }))
        expect(localStorage.getItem(STORAGE_KEY)).toBe('collapsed')
        act(() => {
            vi.advanceTimersByTime(TEASER_MS + 50)
        })
        const autos = telemetryMock.mock.calls.filter((call) => (call[1] as { auto?: boolean }).auto === true)
        expect(autos).toHaveLength(0)
    })

    it('cuando la cápsula del nav se esconde al scrollear, la píldora se cierra y se apaga con ella', () => {
        vi.useFakeTimers()
        renderPill()
        const toggle = screen.getByRole('button', { name: 'Guía de inicio, 0 de 5' })
        expect(toggle.getAttribute('aria-expanded')).toBe('true')

        // Misma regla que la cápsula: delta > 6 px, bajando, más allá de 80 px.
        Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true })
        act(() => {
            window.scrollY = 200
            window.dispatchEvent(new Event('scroll'))
            vi.advanceTimersByTime(20)
        })

        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        const root = toggle.closest('[data-tabbar-minimized]')
        expect(root).not.toBeNull()
        expect(root?.className).toContain('max-md:opacity-0')
    })
})
