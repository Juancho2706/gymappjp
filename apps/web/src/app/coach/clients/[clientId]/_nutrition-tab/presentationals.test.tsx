import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MACRO_COLORS, MacroShareRing, HeatmapCell, ZoneHeader, DetailAccordion } from './presentationals'

/**
 * Golden master (estructural) del slice (Fase 2). Pinea que los 4 componentes hoja + el mapa
 * de colores extraídos verbatim de NutritionTabB5 renderizan igual. La verificación del estilo
 * del ring (CSS de react-circular-progressbar) se hace además VISUALMENTE en el preview
 * (login coach de prueba) — el render snapshot es ciego a la cascada CSS.
 */

describe('MACRO_COLORS', () => {
    it('mantiene las llaves/valores canónicos', () => {
        expect(MACRO_COLORS).toEqual({
            cal: '#007AFF',
            prot: 'var(--color-macro-protein)',
            carb: 'var(--color-macro-carbs)',
            fat: 'var(--color-macro-fats)',
        })
    })
})

describe('MacroShareRing', () => {
    it('muestra los gramos, el label y el % kcal (clamp 0..100)', () => {
        render(<MacroShareRing label="Proteína" grams={120} kcalSharePct={37} color="#fff" />)
        expect(screen.getByText('120g')).toBeInTheDocument()
        expect(screen.getByText('Proteína')).toBeInTheDocument()
        expect(screen.getByText('37% kcal')).toBeInTheDocument()
    })

    it('clampa el porcentaje fuera de rango', () => {
        const { rerender } = render(<MacroShareRing label="X" grams={10} kcalSharePct={250} color="#fff" />)
        expect(screen.getByText('100% kcal')).toBeInTheDocument()
        rerender(<MacroShareRing label="X" grams={10} kcalSharePct={-5} color="#fff" />)
        expect(screen.getByText('0% kcal')).toBeInTheDocument()
    })
})

describe('HeatmapCell', () => {
    it('renderiza un gridcell con aria-label del día (con registro)', () => {
        render(<HeatmapCell day={{ dateKey: '2026-06-01', label: 'L', compliancePct: 90, mealsDone: 3, mealsTotal: 4, hasLog: true }} reduceMotion />)
        const cell = screen.getByRole('gridcell')
        expect(cell).toHaveAttribute('aria-label', '2026-06-01: 3/4 comidas · 90%')
    })

    it('día sin registro: aria-label "sin registro"', () => {
        render(<HeatmapCell day={{ dateKey: '2026-06-02', label: 'M', compliancePct: null, mealsDone: 0, mealsTotal: 0, hasLog: false }} reduceMotion />)
        expect(screen.getByRole('gridcell')).toHaveAttribute('aria-label', '2026-06-02: sin registro')
    })
})

describe('ZoneHeader', () => {
    it('muestra la letra, el título y el subtítulo opcional', () => {
        render(<ZoneHeader letter="A" title="Resumen" subtitle="hoy" />)
        expect(screen.getByText('A')).toBeInTheDocument()
        expect(screen.getByText('Resumen')).toBeInTheDocument()
        expect(screen.getByText('hoy')).toBeInTheDocument()
    })
})

describe('DetailAccordion', () => {
    it('colapsado por defecto; abre al click', () => {
        render(
            <DetailAccordion title="Detalle" reduceMotion>
                <span>contenido-oculto</span>
            </DetailAccordion>
        )
        const btn = screen.getByRole('button', { name: /Detalle/i })
        expect(btn).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByText('contenido-oculto')).not.toBeInTheDocument()
        fireEvent.click(btn)
        expect(btn).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByText('contenido-oculto')).toBeInTheDocument()
    })
})
