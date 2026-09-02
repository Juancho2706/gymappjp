import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

/**
 * B2 (QA del owner 02-09) — borrador del check-in.
 *
 * El estado del formulario ya no muere por un corte de red (eso lo arregla `NetworkProvider`),
 * pero un reload o una navegación accidental seguían borrando lo escrito. Los campos tipeables
 * viven ahora en `sessionStorage` con clave por coach + alumno; las fotos NO (un `File` no es
 * serializable). Fail-soft: sin storage el formulario funciona igual.
 */

const { submitCheckinAction, createCheckinUploadUrlsAction } = vi.hoisted(() => ({
    submitCheckinAction: vi.fn(),
    createCheckinUploadUrlsAction: vi.fn(),
}))

// Server actions: acá solo interesa el estado LOCAL del formulario, no el write real.
vi.mock('./_actions/check-in.actions', () => ({ submitCheckinAction, createCheckinUploadUrlsAction }))
vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}))
vi.mock('browser-image-compression', () => ({ default: vi.fn() }))
vi.mock('canvas-confetti', () => ({ default: vi.fn() }))
vi.mock('@/lib/use-reduced-motion', () => ({ useReducedMotion: () => true }))
// framer-motion fuera: `AnimatePresence mode="wait"` encadena animaciones de salida por rAF y
// convierte el salto entre pasos en una espera no determinista.
vi.mock('framer-motion', async () => {
    const React = await import('react')
    const MOTION_ONLY = new Set([
        'initial', 'animate', 'exit', 'variants', 'custom', 'transition', 'layout', 'layoutId',
        'whileHover', 'whileTap', 'whileInView', 'whileDrag', 'drag', 'viewport',
        'onAnimationStart', 'onAnimationComplete',
    ])
    function stubFor(tag: string) {
        return function MotionStub(props: Record<string, unknown>) {
            const domProps: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(props)) {
                if (key !== 'children' && !MOTION_ONLY.has(key)) domProps[key] = value
            }
            return React.createElement(
                tag,
                domProps as React.HTMLAttributes<HTMLElement>,
                props.children as ReactNode,
            )
        }
    }
    const motion = new Proxy({} as Record<string, unknown>, {
        get: (_target, tag) => stubFor(String(tag)),
    })
    return {
        motion,
        AnimatePresence: ({ children }: { children?: ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        useReducedMotion: () => true,
    }
})

import { CheckInForm } from './CheckInForm'

const COACH_SLUG = 'studio-fuerza-qa'
const STUDENT_ID = '11111111-2222-3333-4444-555555555555'
const DRAFT_KEY = `eva:checkin-draft:${COACH_SLUG}:${STUDENT_ID}`

function renderForm() {
    return render(
        <CheckInForm
            coachSlug={COACH_SLUG}
            studentId={STUDENT_ID}
            coachPrimaryColor="#1462DC"
            lastCheckIn={null}
        />,
    )
}

function readDraft(): Record<string, unknown> | null {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

/** Avanza del paso 1 al 3 (las notas viven en el último paso). */
function goToNotes() {
    fireEvent.click(screen.getAllByRole('button', { name: /Continuar/i })[0])
    fireEvent.click(screen.getAllByRole('button', { name: /Continuar/i })[0])
}

beforeEach(() => {
    window.sessionStorage.clear()
    submitCheckinAction.mockReset()
    submitCheckinAction.mockResolvedValue({ success: true })
    createCheckinUploadUrlsAction.mockReset()
})

describe('CheckInForm — borrador en sessionStorage', () => {
    it('guarda peso, energía y notas mientras el alumno escribe', () => {
        renderForm()

        fireEvent.change(screen.getByLabelText('Peso actual en kilos'), { target: { value: '81,5' } })
        fireEvent.change(document.getElementById('energy_level')!, { target: { value: '4' } })
        goToNotes()
        fireEvent.change(document.getElementById('notes')!, { target: { value: 'Dormí mal toda la semana' } })

        expect(readDraft()).toEqual({
            weight: '81,5',
            energyLevel: 4,
            notes: 'Dormí mal toda la semana',
        })
    })

    it('restaura el borrador al montar (reload / vuelta a la pantalla)', () => {
        window.sessionStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ weight: '81,5', energyLevel: 4, notes: 'Dormí mal toda la semana' }),
        )

        renderForm()

        expect(screen.getByLabelText('Peso actual en kilos')).toHaveValue('81,5')
        expect(document.getElementById('energy_level')).toHaveValue('4')
        goToNotes()
        expect(document.getElementById('notes')).toHaveValue('Dormí mal toda la semana')
    })

    it('ignora un borrador corrupto sin romper el formulario (fail-soft)', () => {
        window.sessionStorage.setItem(DRAFT_KEY, '{no es json')

        renderForm()

        // Prefill por defecto intacto (sin último check-in ⇒ 70.0 kg).
        expect(screen.getByLabelText('Peso actual en kilos')).toHaveValue('70.0')
    })

    it('no cruza borradores entre alumnos del mismo coach', () => {
        window.sessionStorage.setItem(
            `eva:checkin-draft:${COACH_SLUG}:otro-alumno`,
            JSON.stringify({ weight: '99,9', notes: 'notas de otra persona' }),
        )

        renderForm()

        expect(screen.getByLabelText('Peso actual en kilos')).toHaveValue('70.0')
    })

    it('borra el borrador cuando el check-in se envía OK', async () => {
        renderForm()

        fireEvent.change(screen.getByLabelText('Peso actual en kilos'), { target: { value: '81,5' } })
        goToNotes()
        fireEvent.change(document.getElementById('notes')!, { target: { value: 'Todo bien' } })
        expect(readDraft()).not.toBeNull()

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Enviar check-in/i }))
        })

        expect(submitCheckinAction).toHaveBeenCalledTimes(1)
        // Pantalla de éxito (el overlay de celebración repite el titular, así que se ancla al CTA).
        expect(screen.getByRole('button', { name: 'Volver al inicio' })).toBeInTheDocument()
        expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    })
})
