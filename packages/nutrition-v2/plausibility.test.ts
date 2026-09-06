import { describe, expect, it } from 'vitest'
import {
  COACH_ALERT_CONSUMED_RATIO,
  IMPLAUSIBLE_DAY_TARGET_RATIO,
  IMPLAUSIBLE_ITEM_MAX_GRAMS,
  IMPLAUSIBLE_ITEM_MAX_KCAL,
  assessDayPlausibility,
  assessItemPlausibility,
  dayWarningCopy,
  implausibleDayCopy,
  implausibleItemCopy,
  householdUnitActionLabel,
  itemResultingGrams,
  kcalBucket,
  reinterpretUnitActionLabel,
  shouldFlagUnitReview,
  unitEquivalenceCaption,
  unitReviewHint,
} from './plausibility'

/**
 * W1.3 «Cantidades honestas», umbrales de la decision D7 del owner (06-09): un item de mas de
 * 600 g resultantes o mas de 700 kcal avisa; un dia prescrito de mas de 1,5x su meta avisa.
 * Avisa, NO bloquea (misma regla que el mismatch de Atwater).
 *
 * Los dos bordes que no se pueden mover: «Comida libre» de 600 kcal es un item REAL del catalogo
 * de planes y no puede quedar marcado, y los 600 g/700 kcal exactos tampoco (comparacion
 * estricta). Base empirica: p99 de kcal por item activo = 395 kcal.
 */

describe('umbrales (D7 a)', () => {
  it('son los que aprobo el owner y viven en un solo lugar', () => {
    expect(IMPLAUSIBLE_ITEM_MAX_GRAMS).toBe(600)
    expect(IMPLAUSIBLE_ITEM_MAX_KCAL).toBe(700)
    expect(IMPLAUSIBLE_DAY_TARGET_RATIO).toBe(1.5)
    expect(COACH_ALERT_CONSUMED_RATIO).toBe(2)
  })
})

describe('itemResultingGrams', () => {
  const cases: {
    label: string
    input: Parameters<typeof itemResultingGrams>[0]
    expected: number | null
  }[] = [
    { label: 'g es la cantidad misma', input: { quantity: 200, unit: 'g', servingSize: 100 }, expected: 200 },
    { label: 'ml es la cantidad misma', input: { quantity: 250, unit: 'ml', servingSize: 100 }, expected: 250 },
    {
      label: '«30 un» de un alimento de 100 g son 3.000 g (la trampa del tren)',
      input: { quantity: 30, unit: 'un', servingSize: 100 },
      expected: 3000,
    },
    {
      label: '«un» con sinonimo de la UI historica cuenta igual',
      input: { quantity: 2, unit: 'unidad', servingSize: 58 },
      expected: 116,
    },
    {
      label: '«un» sin porcion utilizable no se puede resolver',
      input: { quantity: 3, unit: 'un', servingSize: 0 },
      expected: null,
    },
    {
      label: '`casera` multiplica por los gramos de la medida (W2)',
      input: { quantity: 2, unit: 'casera', servingSize: 100, householdGrams: 61 },
      expected: 122,
    },
    {
      label: '`casera` sin gramos de la medida no se puede resolver',
      input: { quantity: 2, unit: 'casera', servingSize: 100, householdGrams: null },
      expected: null,
    },
    {
      label: '`porción` no tiene gramaje (sus macros son las del grupo)',
      input: { quantity: 1, unit: 'porción', servingSize: 100 },
      expected: null,
    },
    { label: 'unidad desconocida no se resuelve', input: { quantity: 1, unit: 'taza', servingSize: 100 }, expected: null },
    { label: 'unidad ausente no se resuelve', input: { quantity: 1, unit: null, servingSize: 100 }, expected: null },
    { label: 'cantidad no numerica no se resuelve', input: { quantity: NaN, unit: 'g', servingSize: 100 }, expected: null },
  ]

  for (const { label, input, expected } of cases) {
    it(label, () => {
      expect(itemResultingGrams(input)).toBe(expected)
    })
  }
})

describe('assessItemPlausibility', () => {
  const cases: {
    label: string
    input: Parameters<typeof assessItemPlausibility>[0]
    implausible: boolean
    reasons: string[]
    grams: number | null
  }[] = [
    {
      // El caso que abrio el tren: alumno de prueba de Jean, 06-09.
      label: 'Huevo revuelto «30 un» (porcion 100 g, 4.470 kcal) ⇒ gramos Y kcal',
      input: { quantity: 30, unit: 'un', servingSize: 100, calories: 4470 },
      implausible: true,
      reasons: ['grams', 'kcal'],
      grams: 3000,
    },
    {
      label: '6 claras = 200 g y 104 kcal ⇒ plausible',
      input: { quantity: 200, unit: 'g', servingSize: 100, calories: 104 },
      implausible: false,
      reasons: [],
      grams: 200,
    },
    {
      label: '«Comida libre» 1 porción de 600 kcal ⇒ plausible (sin gramaje y bajo el tope)',
      input: { quantity: 1, unit: 'porción', servingSize: null, calories: 600 },
      implausible: false,
      reasons: [],
      grams: null,
    },
    {
      label: '700 kcal exactas ⇒ plausible (el tope es estricto)',
      input: { quantity: 1, unit: 'porción', servingSize: null, calories: 700 },
      implausible: false,
      reasons: [],
      grams: null,
    },
    {
      label: '700,1 kcal ⇒ kcal',
      input: { quantity: 1, unit: 'porción', servingSize: null, calories: 700.1 },
      implausible: true,
      reasons: ['kcal'],
      grams: null,
    },
    {
      label: '600 g exactos ⇒ plausible',
      input: { quantity: 600, unit: 'g', servingSize: 100, calories: 120 },
      implausible: false,
      reasons: [],
      grams: 600,
    },
    {
      label: '601 g ⇒ gramos',
      input: { quantity: 601, unit: 'g', servingSize: 100, calories: 120 },
      implausible: true,
      reasons: ['grams'],
      grams: 601,
    },
    {
      label: 'pan pita «60 un» de Alberto (9.576 kcal) ⇒ gramos Y kcal',
      input: { quantity: 60, unit: 'un', servingSize: 100, calories: 9576 },
      implausible: true,
      reasons: ['grams', 'kcal'],
      grams: 6000,
    },
    {
      label: 'kcal ausentes cuentan como 0 (item libre sin macros)',
      input: { quantity: 100, unit: 'g', servingSize: 100, calories: null },
      implausible: false,
      reasons: [],
      grams: 100,
    },
  ]

  for (const { label, input, implausible, reasons, grams } of cases) {
    it(label, () => {
      const result = assessItemPlausibility(input)
      expect(result.implausible).toBe(implausible)
      expect(result.reasons).toEqual(reasons)
      expect(result.grams).toBe(grams)
    })
  }

  it('devuelve las kcal que recibio (el aviso habla del MISMO numero que muestra la fila)', () => {
    expect(assessItemPlausibility({ quantity: 30, unit: 'un', servingSize: 100, calories: 4470 }).calories).toBe(4470)
  })
})

describe('assessDayPlausibility', () => {
  it('1,49× la meta todavia es plausible', () => {
    const result = assessDayPlausibility({ prescribedCalories: 2980, targetCalories: 2000 })
    expect(result.implausible).toBe(false)
    expect(result.ratio).toBeCloseTo(1.49, 5)
  })

  it('1,51× la meta avisa', () => {
    const result = assessDayPlausibility({ prescribedCalories: 3020, targetCalories: 2000 })
    expect(result.implausible).toBe(true)
    expect(result.ratio).toBeCloseTo(1.51, 5)
  })

  it('1,5× exacto es plausible (el tope es estricto)', () => {
    expect(assessDayPlausibility({ prescribedCalories: 3000, targetCalories: 2000 })).toEqual({
      implausible: false,
      ratio: 1.5,
    })
  })

  it('sin meta utilizable no hay proporcion ni aviso', () => {
    expect(assessDayPlausibility({ prescribedCalories: 4906, targetCalories: null })).toEqual({
      implausible: false,
      ratio: null,
    })
    expect(assessDayPlausibility({ prescribedCalories: 4906, targetCalories: 0 })).toEqual({
      implausible: false,
      ratio: null,
    })
  })
})

describe('copys', () => {
  it('item con gramaje: «¿Seguro? 30 un = 3 kg de huevo revuelto (1 un = 100 g)»', () => {
    expect(
      implausibleItemCopy({
        quantity: 30,
        unit: 'un',
        foodName: 'huevo revuelto',
        grams: 3000,
        calories: 4470,
        servingSize: 100,
      }),
    ).toBe('¿Seguro? 30 un = 3 kg de huevo revuelto (1 un = 100 g)')
  })

  it('item sin gramaje: «¿Seguro? Este ítem suma 4.470 kcal»', () => {
    expect(
      implausibleItemCopy({
        quantity: 1,
        unit: 'porción',
        foodName: 'Comida libre',
        grams: null,
        calories: 4470,
        servingSize: null,
      }),
    ).toBe('¿Seguro? Este ítem suma 4.470 kcal')
  })

  it('bajo el kilo se rotula en gramos, y con decimales en kilos usa coma es-CL', () => {
    const base = { unit: 'un', foodName: 'pan pita', servingSize: 60, calories: 1800 }
    expect(implausibleItemCopy({ ...base, quantity: 11, grams: 660 })).toBe(
      '¿Seguro? 11 un = 660 g de pan pita (1 un = 60 g)',
    )
    expect(implausibleItemCopy({ ...base, quantity: 25, grams: 1500 })).toBe(
      '¿Seguro? 25 un = 1,5 kg de pan pita (1 un = 60 g)',
    )
  })

  it('con unidad de masa no repite el mismo numero dos veces', () => {
    expect(
      implausibleItemCopy({
        quantity: 900,
        unit: 'g',
        foodName: 'arroz cocido',
        grams: 900,
        calories: 1170,
        servingSize: 100,
      }),
    ).toBe('¿Seguro? 900 g de arroz cocido')
  })

  it('sin porcion utilizable no promete una equivalencia que no tiene', () => {
    expect(
      implausibleItemCopy({
        quantity: 3,
        unit: 'un',
        foodName: 'sopa',
        grams: 900,
        calories: 910,
        servingSize: null,
      }),
    ).toBe('¿Seguro? 3 un = 900 g de sopa')
  })

  it('un liquido se rotula en ml y en litros, nunca en gramos', () => {
    expect(
      implausibleItemCopy({
        quantity: 10,
        unit: 'un',
        foodName: 'leche',
        grams: 2500,
        calories: 1250,
        servingSize: 250,
        servingUnit: 'ml',
      }),
    ).toBe('¿Seguro? 10 un = 2,5 l de leche (1 un = 250 ml)')
    expect(
      implausibleItemCopy({
        quantity: 3,
        unit: 'un',
        foodName: 'leche',
        grams: 750,
        calories: 375,
        servingSize: 250,
        servingUnit: 'ml',
      }),
    ).toBe('¿Seguro? 3 un = 750 ml de leche (1 un = 250 ml)')
  })

  it('la medida casera se nombra con SU etiqueta, jamas con el codigo interno', () => {
    expect(
      implausibleItemCopy({
        quantity: 12,
        unit: 'casera',
        foodName: 'huevo',
        grams: 732,
        calories: 1090,
        servingSize: 100,
        householdLabel: 'huevos',
      }),
    ).toBe('¿Seguro? 12 huevos = 732 g de huevo')
  })

  it('sin etiqueta casera cae al copy de kcal (nunca «2 casera»)', () => {
    expect(
      implausibleItemCopy({
        quantity: 12,
        unit: 'casera',
        foodName: 'huevo',
        grams: 732,
        calories: 1090,
        servingSize: 100,
        householdLabel: null,
      }),
    ).toBe('¿Seguro? Este ítem suma 1.090 kcal')
  })

  it('dia: «El día suma 4.906 kcal, 3,2× la meta de 1.556»', () => {
    const { ratio } = assessDayPlausibility({ prescribedCalories: 4906, targetCalories: 1556 })
    expect(ratio).not.toBeNull()
    expect(implausibleDayCopy({ prescribedCalories: 4906, targetCalories: 1556, ratio: ratio as number })).toBe(
      'El día suma 4.906 kcal, 3,2× la meta de 1.556',
    )
  })
})

describe('unitEquivalenceCaption / reinterpretUnitActionLabel', () => {
  it('la caption solo existe con unidad contable y porcion utilizable', () => {
    expect(unitEquivalenceCaption({ unit: 'un', servingSize: 100 })).toBe('1 un = 100 g')
    expect(unitEquivalenceCaption({ unit: 'un', servingSize: 58 })).toBe('1 un = 58 g')
    expect(unitEquivalenceCaption({ unit: 'un', servingSize: 250, servingUnit: 'ml' })).toBe('1 un = 250 ml')
    expect(unitEquivalenceCaption({ unit: 'g', servingSize: 100 })).toBeNull()
    expect(unitEquivalenceCaption({ unit: 'porción', servingSize: 100 })).toBeNull()
    expect(unitEquivalenceCaption({ unit: 'un', servingSize: 0 })).toBeNull()
  })

  it('«Cambiar a N g» repite la MISMA cifra, con la magnitud del alimento', () => {
    expect(reinterpretUnitActionLabel({ quantity: 30 })).toBe('Cambiar a 30 g')
    expect(reinterpretUnitActionLabel({ quantity: 1.5 })).toBe('Cambiar a 1,5 g')
    expect(reinterpretUnitActionLabel({ quantity: 250, servingUnit: 'ml' })).toBe('Cambiar a 250 ml')
  })
})

describe('dayWarningCopy', () => {
  it('une las dos senales con « · » cuando el dia se pasa Y hay items raros', () => {
    expect(
      dayWarningCopy({ prescribedCalories: 4906, targetCalories: 1556, implausibleItemCount: 2 }),
    ).toBe('El día suma 4.906 kcal, 3,2× la meta de 1.556 · 2 ítems con cantidades poco plausibles')
  })

  it('solo el conteo cuando el dia no supera 1,5x su meta', () => {
    expect(dayWarningCopy({ prescribedCalories: 2000, targetCalories: 2000, implausibleItemCount: 1 })).toBe(
      '1 ítem con una cantidad poco plausible',
    )
  })

  it('solo la proporcion cuando ningun item es raro', () => {
    expect(dayWarningCopy({ prescribedCalories: 4906, targetCalories: 1556, implausibleItemCount: 0 })).toBe(
      'El día suma 4.906 kcal, 3,2× la meta de 1.556',
    )
  })

  it('sin nada que decir devuelve null (no se pinta la caja)', () => {
    expect(dayWarningCopy({ prescribedCalories: 2000, targetCalories: 2000, implausibleItemCount: 0 })).toBeNull()
    // Sin meta no hay proporcion, pero un item raro igual se avisa.
    expect(dayWarningCopy({ prescribedCalories: 4906, targetCalories: null, implausibleItemCount: 0 })).toBeNull()
    expect(dayWarningCopy({ prescribedCalories: 4906, targetCalories: null, implausibleItemCount: 1 })).toBe(
      '1 ítem con una cantidad poco plausible',
    )
  })
})

describe('kcalBucket', () => {
  it('los cortes son inclusivos por abajo', () => {
    expect(kcalBucket(700)).toBe('700-1000')
    expect(kcalBucket(999.9)).toBe('700-1000')
    expect(kcalBucket(1000)).toBe('1000-2000')
    expect(kcalBucket(1999.9)).toBe('1000-2000')
    expect(kcalBucket(2000)).toBe('2000-5000')
    expect(kcalBucket(4999.9)).toBe('2000-5000')
    expect(kcalBucket(5000)).toBe('5000+')
    expect(kcalBucket(9576)).toBe('5000+')
  })

  it('por debajo del umbral (no hay aviso que medir) cae al tramo del piso', () => {
    expect(kcalBucket(0)).toBe('700-1000')
    expect(kcalBucket(Number.NaN)).toBe('700-1000')
  })
})

// ---------------------------------------------------------------------------
// W2.5 — «Usar huevos» y el badge «Revisar unidad»
// ---------------------------------------------------------------------------

describe('householdUnitActionLabel', () => {
  it('arma la accion con la etiqueta del alimento', () => {
    expect(householdUnitActionLabel('huevos')).toBe('Usar huevos')
    expect(householdUnitActionLabel('  taza  ')).toBe('Usar taza')
  })

  it('sin etiqueta no hay boton que ofrecer', () => {
    expect(householdUnitActionLabel(null)).toBeNull()
    expect(householdUnitActionLabel('   ')).toBeNull()
  })
})

describe('shouldFlagUnitReview', () => {
  /** El caso del tren: alimento de 100 g prescrito en `un`, con una pieza real de 61 g. */
  const huevoEnUn = { unit: 'un', servingUnit: 'g', servingSize: 100, householdGrams: 61 }

  it('marca `un` sobre un alimento NO contable cuya pieza real difiere > 30 %', () => {
    expect(shouldFlagUnitReview(huevoEnUn)).toBe(true)
    // «pan pita 60 un»: 1 un = 100 g pero una pita pesa 45 g.
    expect(shouldFlagUnitReview({ ...huevoEnUn, householdGrams: 45 })).toBe(true)
  })

  it('no marca cuando la medida casera se parece a la porcion (nada que revisar)', () => {
    expect(shouldFlagUnitReview({ ...huevoEnUn, householdGrams: 90 })).toBe(false)
    // El umbral es estricto: exactamente 30 % NO marca.
    expect(shouldFlagUnitReview({ ...huevoEnUn, householdGrams: 70 })).toBe(false)
    expect(shouldFlagUnitReview({ ...huevoEnUn, householdGrams: 69 })).toBe(true)
  })

  it('no marca un alimento REALMENTE contable: ahi «1 un» ya es una pieza', () => {
    expect(shouldFlagUnitReview({ ...huevoEnUn, servingUnit: 'un' })).toBe(false)
    expect(shouldFlagUnitReview({ ...huevoEnUn, servingUnit: 'unidad' })).toBe(false)
  })

  it('no marca fuera de `un`, ni sin los datos con que comparar', () => {
    expect(shouldFlagUnitReview({ ...huevoEnUn, unit: 'g' })).toBe(false)
    expect(shouldFlagUnitReview({ ...huevoEnUn, unit: 'casera' })).toBe(false)
    expect(shouldFlagUnitReview({ ...huevoEnUn, householdGrams: null })).toBe(false)
    expect(shouldFlagUnitReview({ ...huevoEnUn, servingSize: null })).toBe(false)
  })
})

describe('unitReviewHint', () => {
  it('dice las DOS cifras, que es justo el punto (no coinciden)', () => {
    expect(
      unitReviewHint({ servingSize: 100, householdGrams: 61, householdLabel: 'huevo', servingUnit: 'g' }),
    ).toBe('Acá 1 un = 100 g; 1 huevo del catálogo = 61 g')
  })

  it('un liquido se rotula en ml', () => {
    expect(
      unitReviewHint({ servingSize: 100, householdGrams: 240, householdLabel: 'taza', servingUnit: 'ml' }),
    ).toBe('Acá 1 un = 100 ml; 1 taza del catálogo = 240 ml')
  })
})
