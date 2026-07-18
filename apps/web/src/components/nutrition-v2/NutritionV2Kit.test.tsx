import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createNutritionMacroValue } from '@eva/nutrition-v2'
import {
  MacroBudget,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
  StudentPreview,
} from './index'

describe('Nutrition V2 web kit', () => {
  it('renders macro progress with accessible values', () => {
    render(
      <MacroBudget
        calories={{ consumed: 1420, target: 2100 }}
        macros={[
          createNutritionMacroValue('protein', { consumed: 124, target: 160 }),
          createNutritionMacroValue('carbs', { consumed: 148, target: 230 }),
          createNutritionMacroValue('fats', { consumed: 48, target: 65 }),
        ]}
      />,
    )

    expect(screen.getByRole('region', { name: 'Presupuesto nutricional' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /Proteína: 124 de 160 g/i })).toHaveAttribute('aria-valuenow', '124')
    expect(screen.getByText(/680 kcal restantes/i)).toBeInTheDocument()
  })

  it('renders strategy and immutable version language', () => {
    render(
      <div>
        <StrategyBadge strategy="hybrid" />
        <PlanVersionBadge effectiveLabel="desde 14 Jul" status="published" version={3} />
      </div>,
    )

    expect(screen.getByText('Plan híbrido')).toBeInTheDocument()
    expect(screen.getByText(/v3 · Publicado/i)).toBeInTheDocument()
  })

  it('provides explicit empty state copy', () => {
    render(
      <NutritionStatePanel
        description="Registra tu primer alimento para comenzar el día."
        title="Todavía no hay consumo"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Todavía no hay consumo' })).toBeInTheDocument()
    expect(screen.getByText(/Registra tu primer alimento/i)).toBeInTheDocument()
  })

  it('uses semantic surfaces in student preview', () => {
    const { container } = render(
      <StudentPreview themeLabel="Oscuro">
        <p>Contenido</p>
      </StudentPreview>,
    )

    expect(container.querySelector('.border-surface-inverse')).toBeTruthy()
    expect(screen.getByText('Contenido')).toBeInTheDocument()
  })
})
