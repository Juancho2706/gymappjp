import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildNutritionWeek } from '@eva/nutrition-v2'
import { WeekDayNav } from './index'

// Semana de referencia: lunes 2026-07-27 … domingo 2026-08-02. Hoy = miércoles 2026-07-29.
const LUNES = '2026-07-27'
const MARTES = '2026-07-28'
const MIERCOLES = '2026-07-29'
const JUEVES = '2026-07-30'

const targets = {
  calories: 2000,
  proteinG: 150,
  carbsG: 200,
  fatsG: 60,
  fiberG: 25,
}

const consumed = (entryCount: number) => ({
  calories: 1800,
  proteinG: 120,
  carbsG: 180,
  fatsG: 50,
  fiberG: 18,
  entryCount,
})

const cells = buildNutritionWeek({
  variants: [{ id: 'base', dayOfWeek: null, isDefault: true, targets }],
  history: [
    { localDate: LUNES, targets, consumed: consumed(4), activeEntryCount: 4 },
    { localDate: MARTES, targets, consumed: null, activeEntryCount: 0 },
  ],
  weekStartIso: LUNES,
  todayIso: MIERCOLES,
})

describe('WeekDayNav', () => {
  it('pinta 7 chips con la inicial del día y el número del mes', () => {
    render(<WeekDayNav cells={cells} onSelect={vi.fn()} selectedIso={MIERCOLES} />)

    const chips = screen.getAllByRole('button')
    expect(chips).toHaveLength(7)
    expect(chips[0].textContent).toBe('Lu27')
    expect(chips[6].textContent).toBe('Do2')
  })

  it('marca HOY con aria-current aunque el día seleccionado sea otro', () => {
    render(<WeekDayNav cells={cells} onSelect={vi.fn()} selectedIso={LUNES} />)

    const hoy = screen.getByLabelText('Miércoles 29, hoy')
    expect(hoy).toHaveAttribute('aria-current', 'date')
    expect(hoy).toHaveAttribute('aria-pressed', 'false')

    const seleccionado = screen.getByLabelText('Lunes 27, con registro')
    expect(seleccionado).toHaveAttribute('aria-pressed', 'true')
    expect(seleccionado).not.toHaveAttribute('aria-current')
  })

  it('etiqueta cada día con su estado: sin registro en el pasado vacío, próximo en el futuro', () => {
    render(<WeekDayNav cells={cells} onSelect={vi.fn()} selectedIso={MIERCOLES} />)

    expect(screen.getByLabelText('Martes 28, sin registro')).toBeInTheDocument()
    expect(screen.getByLabelText('Jueves 30, próximo')).toBeInTheDocument()
  })

  it('avisa la fecha elegida sin navegar por su cuenta', () => {
    const onSelect = vi.fn()
    render(<WeekDayNav cells={cells} onSelect={onSelect} selectedIso={MIERCOLES} />)

    fireEvent.click(screen.getByLabelText('Jueves 30, próximo'))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(JUEVES)
  })

  it('mueve el foco con las flechas y cierra el ciclo en los extremos', () => {
    render(<WeekDayNav cells={cells} onSelect={vi.fn()} selectedIso={MIERCOLES} />)
    const chips = screen.getAllByRole('button')

    chips[0].focus()
    fireEvent.keyDown(chips[0], { key: 'ArrowRight' })
    expect(document.activeElement).toBe(chips[1])

    fireEvent.keyDown(chips[1], { key: 'ArrowLeft' })
    fireEvent.keyDown(chips[0], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(chips[6])

    fireEvent.keyDown(chips[6], { key: 'Home' })
    expect(document.activeElement).toBe(chips[0])
  })

  it('no renderiza nada sin celdas', () => {
    const { container } = render(<WeekDayNav cells={[]} onSelect={vi.fn()} selectedIso={MIERCOLES} />)
    expect(container).toBeEmptyDOMElement()
  })
})
