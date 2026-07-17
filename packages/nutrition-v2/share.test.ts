import { describe, expect, it } from 'vitest'
import { buildNutritionDayShareText } from './share'

describe('buildNutritionDayShareText', () => {
  it('arma el resumen completo con fecha legible, macros meta e ítems', () => {
    const text = buildNutritionDayShareText({
      localDate: '2024-01-01', // lunes
      planName: 'Definición',
      consumed: { calories: 1850, proteinG: 120, carbsG: 180, fatsG: 55 },
      targets: { calories: 2100, proteinG: 150, carbsG: 210, fatsG: 70 },
      items: [
        { name: 'Pollo', quantity: 150, unit: 'g' },
        { name: 'Arroz', quantity: 100, unit: 'g' },
      ],
    })
    expect(text).toBe(
      [
        'Mi día · Definición',
        'lunes 1 de enero',
        '',
        'Energía: 1.850 / 2.100 kcal',
        'Proteína: 120 / 150 g',
        'Carbohidratos: 180 / 210 g',
        'Grasas: 55 / 70 g',
        '',
        'Lo que comí:',
        '• Pollo — 150 g',
        '• Arroz — 100 g',
      ].join('\n'),
    )
  })

  it('sin metas muestra solo lo consumido, y sin plan usa el título genérico', () => {
    const text = buildNutritionDayShareText({
      localDate: '2024-01-01',
      consumed: { calories: 900, proteinG: 40, carbsG: 90, fatsG: 20 },
      targets: { calories: null, proteinG: null, carbsG: null, fatsG: null },
      items: [{ name: 'Yogur', quantity: 125, unit: 'g' }],
    })
    expect(text.startsWith('Mi día de nutrición\nlunes 1 de enero')).toBe(true)
    expect(text).toContain('Energía: 900 kcal')
    expect(text).toContain('Proteína: 40 g')
    expect(text).not.toContain('/')
  })

  it('sin ítems muestra el estado vacío', () => {
    const text = buildNutritionDayShareText({
      localDate: '2024-01-01',
      consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
      targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60 },
      items: [],
    })
    expect(text).toContain('Todavía no registro alimentos hoy.')
    expect(text).not.toContain('Lo que comí:')
  })

  it('trunca los ítems a maxItems y resume el resto con "(y N más)"', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ name: `Alimento ${i + 1}`, quantity: 100, unit: 'g' }))
    const text = buildNutritionDayShareText({
      localDate: '2024-01-01',
      consumed: { calories: 1000, proteinG: 50, carbsG: 100, fatsG: 30 },
      targets: { calories: 2000, proteinG: 150, carbsG: 200, fatsG: 60 },
      items,
      maxItems: 3,
    })
    expect(text).toContain('• Alimento 1 — 100 g')
    expect(text).toContain('• Alimento 3 — 100 g')
    expect(text).not.toContain('• Alimento 4 — 100 g')
    expect(text).toContain('(y 7 más)')
  })

  it('fecha inválida cae a la cadena original', () => {
    const text = buildNutritionDayShareText({
      localDate: 'no-es-fecha',
      consumed: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 },
      targets: {},
      items: [],
    })
    expect(text).toContain('no-es-fecha')
  })
})
