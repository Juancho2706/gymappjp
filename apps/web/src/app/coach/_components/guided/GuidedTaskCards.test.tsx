import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GuidedTaskCards } from './GuidedTaskCards'
import { guidedCardsStorageKey, isGuidedSurfaceDismissed, readGuidedCardsMemory } from './guided-cards-memory'

const CARDS = [
    { id: 'uno', title: 'Cambia un alimento', body: 'Toca cualquier alimento.' },
    { id: 'dos', title: 'Ajusta una porción', body: 'Sube o baja la cantidad.', done: true },
    { id: 'tres', title: 'Publica', body: 'Tu alumno la ve en su app.' },
]

function renderCards(overrides: Partial<Parameters<typeof GuidedTaskCards>[0]> = {}) {
    return render(
        <GuidedTaskCards
            coachId="coach-1"
            surface="nutrition_plan"
            eyebrow="Tu primera pauta"
            title="Tres cambios y queda publicada"
            cards={CARDS}
            {...overrides}
        />,
    )
}

describe('GuidedTaskCards', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('pinta las tres tarjetas con su copy', () => {
        renderCards()
        expect(screen.getByTestId('guided-task-cards')).toBeTruthy()
        expect(screen.getByText('Cambia un alimento')).toBeTruthy()
        expect(screen.getByText('Ajusta una porción')).toBeTruthy()
        expect(screen.getByText('Publica')).toBeTruthy()
    })

    it('no se pinta si el coach ya la cerró antes (memoria por coach)', () => {
        localStorage.setItem(
            guidedCardsStorageKey('coach-1'),
            JSON.stringify({ dismissed: ['nutrition_plan'] }),
        )
        renderCards()
        expect(screen.queryByTestId('guided-task-cards')).toBeNull()
    })

    it('la memoria de OTRA superficie no la esconde', () => {
        localStorage.setItem(
            guidedCardsStorageKey('coach-1'),
            JSON.stringify({ dismissed: ['cardio_zones'] }),
        )
        renderCards()
        expect(screen.getByTestId('guided-task-cards')).toBeTruthy()
    })

    it('«Ocultar la ayuda» la cierra y lo recuerda', () => {
        renderCards()
        fireEvent.click(screen.getByLabelText('Ocultar la ayuda'))
        expect(screen.queryByTestId('guided-task-cards')).toBeNull()
        expect(isGuidedSurfaceDismissed(readGuidedCardsMemory('coach-1'), 'nutrition_plan')).toBe(true)
    })

    it('la acción de una tarjeta dispara su handler', () => {
        const onClick = vi.fn()
        renderCards({
            cards: [
                ...CARDS.slice(0, 2),
                { ...CARDS[2], action: { label: 'Publicar y ver como Ana', onClick, tone: 'primary' } },
            ],
        })
        fireEvent.click(screen.getByRole('button', { name: 'Publicar y ver como Ana' }))
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('una acción ocupada queda deshabilitada (nada de doble publish)', () => {
        const onClick = vi.fn()
        renderCards({
            cards: [
                ...CARDS.slice(0, 2),
                { ...CARDS[2], action: { label: 'Armar semana base', onClick, busy: true } },
            ],
        })
        const button = screen.getByRole('button', { name: 'Armar semana base' })
        expect(button.hasAttribute('disabled')).toBe(true)
    })

    it('sin tarjetas no pinta nada', () => {
        renderCards({ cards: [] })
        expect(screen.queryByTestId('guided-task-cards')).toBeNull()
    })
})
