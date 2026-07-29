import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildNutritionPlanDowStrip } from '@eva/nutrition-v2'
import { PlanDowSelector } from './index'

// Hoy = miércoles 2026-07-29. Plan con día base (Lu-Vi + Do) y sábado propio.
const HOY = '2026-07-29'

const base = {
  id: 'base',
  label: 'Día base',
  dayOfWeek: null,
  isDefault: true,
  targets: { calories: 2200 },
  mealSlots: [{ prescriptionItems: [{ macros: { calories: 2180 } }] }],
}

const sabado = {
  id: 'sa',
  label: 'Día libre controlado',
  dayOfWeek: 6,
  isDefault: false,
  targets: { calories: 2700 },
  mealSlots: [{ prescriptionItems: [{ macros: { calories: 2640 } }] }],
}

const cells = buildNutritionPlanDowStrip({ variants: [base, sabado], todayIso: HOY })

describe('PlanDowSelector', () => {
  it('pinta 7 celdas con la inicial del día y las kcal que recibe (sin unidad, sin fecha)', () => {
    render(<PlanDowSelector cells={cells} onSelect={vi.fn()} selectedDow={3} />)

    const celdas = screen.getAllByRole('button')
    expect(celdas).toHaveLength(7)
    expect(celdas[0].textContent).toBe('Lu2.180')
    expect(celdas[5].textContent).toBe('Sá2.640')
  })

  it('distingue día propio de día heredado y marca hoy en la etiqueta accesible', () => {
    render(<PlanDowSelector cells={cells} onSelect={vi.fn()} selectedDow={6} />)

    expect(screen.getByLabelText('Lunes, sigue el día base, 2.180 kcal prescritas')).toBeInTheDocument()
    const propio = screen.getByLabelText('Sábado, día propio, 2.640 kcal prescritas')
    expect(propio).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByLabelText('Miércoles, sigue el día base, 2.180 kcal prescritas, hoy'),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('avisa el día elegido sin decidir nada por su cuenta', () => {
    const onSelect = vi.fn()
    render(<PlanDowSelector cells={cells} onSelect={onSelect} selectedDow={1} />)

    fireEvent.click(screen.getByLabelText('Sábado, día propio, 2.640 kcal prescritas'))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(6)
  })

  it('mueve el foco con las flechas y cierra el ciclo en los extremos', () => {
    render(<PlanDowSelector cells={cells} onSelect={vi.fn()} selectedDow={1} />)
    const celdas = screen.getAllByRole('button')

    celdas[0].focus()
    fireEvent.keyDown(celdas[0], { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(celdas[6])

    fireEvent.keyDown(celdas[6], { key: 'End' })
    expect(document.activeElement).toBe(celdas[6])

    fireEvent.keyDown(celdas[6], { key: 'Home' })
    expect(document.activeElement).toBe(celdas[0])
  })

  it('un día sin estructura muestra guion en vez de un 0 inventado', () => {
    const soloSabado = buildNutritionPlanDowStrip({ variants: [sabado], todayIso: HOY })
    render(<PlanDowSelector cells={soloSabado} onSelect={vi.fn()} selectedDow={6} />)

    expect(screen.getByLabelText('Lunes, sin estructura prescrita').textContent).toBe('Lu—')
  })

  it('no renderiza nada sin celdas', () => {
    const { container } = render(<PlanDowSelector cells={[]} onSelect={vi.fn()} selectedDow={1} />)
    expect(container).toBeEmptyDOMElement()
  })
})
