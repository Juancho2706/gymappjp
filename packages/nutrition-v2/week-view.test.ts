import { describe, expect, it } from 'vitest'
import type { NutritionHistoryDay, NutritionPlanReadModel } from './read-models'
import {
  addNutritionDays,
  alignNutritionIsoToWeekOf,
  buildNutritionWeek,
  buildNutritionWeekDates,
  formatNutritionWeekDayAccessibilityLabel,
  formatNutritionWeekPlanLinkLabel,
  nutritionWeekStartIso,
  type NutritionWeekHistoryDayLike,
  type NutritionWeekVariantLike,
} from './week-view'

// Semana de referencia: lunes 2026-07-27 … domingo 2026-08-02. Hoy = miércoles 2026-07-29.
const LUNES = '2026-07-27'
const MARTES = '2026-07-28'
const MIERCOLES = '2026-07-29'
const JUEVES = '2026-07-30'
const VIERNES = '2026-07-31'
const SABADO = '2026-08-01'
const DOMINGO = '2026-08-02'

interface Variant extends NutritionWeekVariantLike {
  id: string
  label: string
}

const targets = (calories: number) => ({
  calories,
  proteinG: 150,
  carbsG: 200,
  fatsG: 60,
  fiberG: 25,
  sodiumMg: null,
  waterMl: null,
})

const base: Variant = {
  id: 'base',
  label: 'Todos los días',
  dayOfWeek: null,
  isDefault: true,
  targets: targets(2000),
}
const sabado: Variant = {
  id: 'sa',
  label: 'Sábado',
  dayOfWeek: 6,
  isDefault: false,
  targets: targets(2600),
}
const variants: Variant[] = [base, sabado]

const consumed = (calories: number, entryCount: number) => ({
  calories,
  proteinG: 120,
  carbsG: 180,
  fatsG: 50,
  fiberG: 18,
  entryCount,
})

function historyDay(
  localDate: string,
  overrides: Partial<NutritionWeekHistoryDayLike> = {},
): NutritionWeekHistoryDayLike {
  return {
    localDate,
    targets: targets(2000),
    consumed: consumed(0, 0),
    activeEntryCount: 0,
    legacyCompletionCount: 0,
    legacyDisclosure: null,
    ...overrides,
  }
}

// Chequeo de COMPILACIÓN: el read-model real (plan.dayVariants del alumno/coach y las filas de
// history/recentDays) cumple los tipos estructurales del helper sin un solo cast. Si alguna vez
// deja de cumplirlos, la tupla de abajo no compila.
type VarianteRealCumple =
  NutritionPlanReadModel['dayVariants'][number] extends NutritionWeekVariantLike ? true : never
type HistorialRealCumple = NutritionHistoryDay extends NutritionWeekHistoryDayLike ? true : never
const compatibilidadConElReadModel: [VarianteRealCumple, HistorialRealCumple] = [true, true]

describe('contrato con el read-model', () => {
  it('las variantes y los días de historial reales calzan sin casts', () => {
    expect(compatibilidadConElReadModel).toEqual([true, true])
  })
})

describe('helpers de fecha', () => {
  it('desplaza días sin correr la fecha por zona horaria', () => {
    expect(addNutritionDays(LUNES, 6)).toBe(DOMINGO)
    expect(addNutritionDays(DOMINGO, -6)).toBe(LUNES)
    expect(addNutritionDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addNutritionDays('no-es-fecha', 1)).toBeNull()
  })

  it('resuelve el lunes de la semana desde cualquier día, con el domingo cerrando', () => {
    expect(nutritionWeekStartIso(LUNES)).toBe(LUNES)
    expect(nutritionWeekStartIso(MIERCOLES)).toBe(LUNES)
    expect(nutritionWeekStartIso(DOMINGO)).toBe(LUNES)
    expect(nutritionWeekStartIso('2026-02-30')).toBeNull()
  })

  it('arma las 7 fechas de lunes a domingo', () => {
    expect(buildNutritionWeekDates(SABADO)).toEqual([
      LUNES,
      MARTES,
      MIERCOLES,
      JUEVES,
      VIERNES,
      SABADO,
      DOMINGO,
    ])
  })
})

describe('buildNutritionWeek — forma de la semana', () => {
  it('siempre devuelve 7 celdas en orden lunes → domingo', () => {
    const week = buildNutritionWeek({ variants, history: [], weekStartIso: LUNES, todayIso: MIERCOLES })
    expect(week).toHaveLength(7)
    expect(week.map((cell) => cell.shortLabel)).toEqual(['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'])
    expect(week.map((cell) => cell.isoDate)).toEqual([
      LUNES,
      MARTES,
      MIERCOLES,
      JUEVES,
      VIERNES,
      SABADO,
      DOMINGO,
    ])
    expect(week.map((cell) => cell.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0])
  })

  it('normaliza cualquier día de la semana al lunes que la abre', () => {
    const desdeSabado = buildNutritionWeek({ variants, weekStartIso: SABADO, todayIso: MIERCOLES })
    expect(desdeSabado.map((cell) => cell.isoDate)).toEqual(
      buildNutritionWeek({ variants, weekStartIso: LUNES, todayIso: MIERCOLES }).map((cell) => cell.isoDate),
    )
  })

  it('no inventa calendario con una fecha de inicio inválida', () => {
    expect(buildNutritionWeek({ variants, weekStartIso: 'mañana', todayIso: MIERCOLES })).toEqual([])
    expect(buildNutritionWeek({ variants, weekStartIso: null, todayIso: MIERCOLES })).toEqual([])
  })
})

describe('buildNutritionWeek — estados', () => {
  it('marca hoy una sola vez y separa pasado de futuro (hoy a media semana)', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(LUNES, { activeEntryCount: 3, consumed: consumed(1800, 3) })],
      weekStartIso: LUNES,
      todayIso: MIERCOLES,
    })
    expect(week.map((cell) => cell.state)).toEqual([
      'past-logged',
      'past-empty',
      'today',
      'future',
      'future',
      'future',
      'future',
    ])
    expect(week.filter((cell) => cell.state === 'today')).toHaveLength(1)
  })

  it('hoy = lunes: el resto de la semana es futuro', () => {
    const week = buildNutritionWeek({ variants, weekStartIso: LUNES, todayIso: LUNES })
    expect(week[0].state).toBe('today')
    expect(week.slice(1).every((cell) => cell.state === 'future')).toBe(true)
  })

  it('hoy = domingo: toda la semana previa es pasado', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(VIERNES, { activeEntryCount: 2, consumed: consumed(1500, 2) })],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week[6].state).toBe('today')
    expect(week.slice(0, 6).map((cell) => cell.state)).toEqual([
      'past-empty',
      'past-empty',
      'past-empty',
      'past-empty',
      'past-logged',
      'past-empty',
    ])
  })

  it('sin hoy válido nada es "hoy" y la semana cae a solo lectura', () => {
    const week = buildNutritionWeek({ variants, weekStartIso: LUNES, todayIso: null })
    expect(week.some((cell) => cell.state === 'today')).toBe(false)
    expect(week.every((cell) => cell.state === 'past-empty')).toBe(true)
  })

  it('describe el día y su estado para lectores de pantalla', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(LUNES, { activeEntryCount: 1, consumed: consumed(900, 1) })],
      weekStartIso: LUNES,
      todayIso: MIERCOLES,
    })
    expect(formatNutritionWeekDayAccessibilityLabel(week[0])).toBe('Lunes, con registro')
    expect(formatNutritionWeekDayAccessibilityLabel(week[1])).toBe('Martes, sin registro')
    expect(formatNutritionWeekDayAccessibilityLabel(week[2])).toBe('Miércoles, hoy')
    expect(formatNutritionWeekDayAccessibilityLabel(week[6])).toBe('Domingo, próximo')
  })
})

describe('buildNutritionWeek — variante del día', () => {
  it('el match exacto de día gana y el resto cae a la base', () => {
    const week = buildNutritionWeek({ variants, weekStartIso: LUNES, todayIso: MIERCOLES })
    expect(week.map((cell) => cell.variant?.id)).toEqual([
      'base',
      'base',
      'base',
      'base',
      'base',
      'sa',
      'base',
    ])
  })

  it('plan sin default: los días sin variante propia quedan sin plan (no se inventa una)', () => {
    const week = buildNutritionWeek({ variants: [sabado], weekStartIso: LUNES, todayIso: MIERCOLES })
    expect(week.map((cell) => cell.variant?.id ?? null)).toEqual([
      null,
      null,
      null,
      null,
      null,
      'sa',
      null,
    ])
    expect(week[0].targets).toBeNull()
    expect(week[0].targetsSource).toBe('none')
    expect(week[5].targets?.calories).toBe(2600)
  })

  it('dos variantes reclamando el mismo día: gana la primera del arreglo (order_index del RPC)', () => {
    // No hay unique en (version_id, day_of_week): el read-model ya viene ordenado por
    // order_index, created_at — igual que el `order by` del snapshot.
    const sabadoA: Variant = { id: 'sa-a', label: 'Sábado A', dayOfWeek: 6, isDefault: false, targets: targets(2600) }
    const sabadoB: Variant = { id: 'sa-b', label: 'Sábado B', dayOfWeek: 6, isDefault: false, targets: targets(3100) }
    const week = buildNutritionWeek({
      variants: [base, sabadoA, sabadoB],
      weekStartIso: LUNES,
      todayIso: MIERCOLES,
    })
    expect(week[5].variant?.id).toBe('sa-a')
    expect(week[5].targets?.calories).toBe(2600)
  })

  it('sin variantes la semana existe igual, vacía de plan', () => {
    const week = buildNutritionWeek({ variants: [], weekStartIso: LUNES, todayIso: MIERCOLES })
    expect(week).toHaveLength(7)
    expect(week.every((cell) => cell.variant === null && cell.targets === null)).toBe(true)
  })
})

describe('buildNutritionWeek — historial disperso', () => {
  it('rellena los huecos client-side: día sin fila = sin registro, no cero', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(MARTES, { activeEntryCount: 4, consumed: consumed(2100, 4) })],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week[0].historyDay).toBeUndefined()
    expect(week[0].consumed).toBeNull()
    expect(week[0].state).toBe('past-empty')
    expect(week[1].consumed?.calories).toBe(2100)
    expect(week[1].state).toBe('past-logged')
  })

  it('ignora las filas de otras semanas que trae el cursor sin cota inferior', () => {
    const week = buildNutritionWeek({
      variants,
      history: [
        historyDay('2026-07-20', { activeEntryCount: 9, consumed: consumed(3000, 9) }),
        historyDay(MARTES, { activeEntryCount: 1, consumed: consumed(1200, 1) }),
      ],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week.filter((cell) => cell.historyDay != null).map((cell) => cell.isoDate)).toEqual([MARTES])
  })

  it('día con snapshot pero sin ingestas: consumed null (≠ registro en cero)', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(MARTES)],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week[1].historyDay).toBeDefined()
    expect(week[1].consumed).toBeNull()
    expect(week[1].state).toBe('past-empty')
  })

  it('distingue "registró y comió cero calorías" de "no registró"', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(MARTES, { activeEntryCount: 1, consumed: consumed(0, 1) })],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week[1].consumed).not.toBeNull()
    expect(week[1].consumed?.calories).toBe(0)
    expect(week[1].consumed?.entryCount).toBe(1)
    expect(week[1].state).toBe('past-logged')
  })

  it('el futuro nunca muestra consumo aunque exista fila de mañana', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(JUEVES, { activeEntryCount: 2, consumed: consumed(700, 2) })],
      weekStartIso: LUNES,
      todayIso: MIERCOLES,
    })
    expect(week[3].state).toBe('future')
    expect(week[3].consumed).toBeNull()
  })

  it('la primera fila gana ante fechas repetidas', () => {
    const week = buildNutritionWeek({
      variants,
      history: [
        historyDay(MARTES, { activeEntryCount: 1, consumed: consumed(1000, 1) }),
        historyDay(MARTES, { activeEntryCount: 5, consumed: consumed(9999, 5) }),
      ],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week[1].consumed?.calories).toBe(1000)
  })
})

describe('buildNutritionWeek — el snapshot gana sobre la proyección', () => {
  it('usa las metas congeladas del historial cuando difieren del plan vigente', () => {
    // El coach republicó el plan a mitad de semana: el lunes tuvo 1.700 kcal, no las 2.000 de hoy.
    const week = buildNutritionWeek({
      variants,
      history: [
        historyDay(LUNES, {
          targets: targets(1700),
          activeEntryCount: 2,
          consumed: consumed(1650, 2),
        }),
      ],
      weekStartIso: LUNES,
      todayIso: MIERCOLES,
    })
    expect(week[0].targets?.calories).toBe(1700)
    expect(week[0].targetsSource).toBe('snapshot')
    // El martes no tiene fila: se proyecta con el plan vigente y queda rotulado como proyección.
    expect(week[1].targets?.calories).toBe(2000)
    expect(week[1].targetsSource).toBe('projected')
  })

  it('un snapshot sin metas no se rellena con la proyección de hoy', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(LUNES, { targets: null, activeEntryCount: 1, consumed: consumed(500, 1) })],
      weekStartIso: LUNES,
      todayIso: MIERCOLES,
    })
    expect(week[0].targets).toBeNull()
    expect(week[0].targetsSource).toBe('none')
    // Lo que importa: NO se filtró la proyección del plan vigente sobre un día ya congelado.
    expect(week[1].targets?.calories).toBe(2000)
  })
})

describe('buildNutritionWeek — días del sistema anterior (V1)', () => {
  const legacyRow = historyDay(MARTES, {
    targets: null,
    consumed: consumed(0, 0),
    activeEntryCount: 0,
    legacyDisclosure: 'legacy_completion_without_food_detail',
    legacyCompletionCount: 3,
    legacyEntryCount: 3,
    legacyConsumed: { calories: 1820, proteinG: 110, carbsG: 190, fatsG: 55 },
    legacyMeals: ['Desayuno', 'Almuerzo', 'Cena'],
  })

  it('no pinta 0 kcal falsos: anula el consumo V2 y expone el resumen legacy', () => {
    const week = buildNutritionWeek({
      variants,
      history: [legacyRow],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    const martes = week[1]
    expect(martes.state).toBe('past-logged')
    expect(martes.consumed).toBeNull()
    expect(martes.isLegacy).toBe(true)
    expect(martes.legacy?.legacyOnly).toBe(true)
    expect(martes.legacy?.hasMacros).toBe(true)
    expect(martes.legacy?.consumed?.calories).toBe(1820)
    expect(martes.legacy?.secondaryLabel).toBe('Sistema anterior · 1820 kcal')
    expect(martes.legacy?.mealsLabel).toBe('Desayuno · Almuerzo · Cena')
  })

  it('día legacy sin macros: cuenta como registrado y se describe por comidas completadas', () => {
    const week = buildNutritionWeek({
      variants,
      history: [
        historyDay(MARTES, {
          activeEntryCount: 0,
          legacyDisclosure: 'legacy_completion_without_food_detail',
          legacyCompletionCount: 2,
          legacyConsumed: null,
          legacyMeals: null,
        }),
      ],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week[1].state).toBe('past-logged')
    expect(week[1].consumed).toBeNull()
    expect(week[1].legacy?.completionsLabel).toBe('2 comidas completadas')
    expect(week[1].legacy?.secondaryLabel).toBe('Sistema anterior · 2 comidas completadas')
  })

  it('día mixto (V1 + V2): manda el consumo real V2 y el resumen legacy queda de contexto', () => {
    const week = buildNutritionWeek({
      variants,
      history: [
        historyDay(MARTES, {
          activeEntryCount: 2,
          consumed: consumed(1400, 2),
          legacyDisclosure: 'legacy_completion_without_food_detail',
          legacyCompletionCount: 1,
        }),
      ],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week[1].consumed?.calories).toBe(1400)
    expect(week[1].isLegacy).toBe(true)
    expect(week[1].legacy?.legacyOnly).toBe(false)
  })

  it('los días sin datos del sistema anterior no traen bandera ni resumen', () => {
    const week = buildNutritionWeek({
      variants,
      history: [historyDay(MARTES, { activeEntryCount: 1, consumed: consumed(1000, 1) })],
      weekStartIso: LUNES,
      todayIso: DOMINGO,
    })
    expect(week[1].isLegacy).toBeUndefined()
    expect(week[1].legacy).toBeNull()
    expect(week[0].legacy).toBeNull()
  })
})

// T2.7 (catalogo Alumno 05): el punto del strip se pinta por RANGO de energia. Materializado en
// la celda por buildNutritionWeek para sobrevivir a las podas del borde RSC → cliente.
describe('buildNutritionWeek — rangeDot por rango de energia', () => {
  it('pasado: verde dentro del ±10%, ambar afuera, logged sin meta, none sin registro', () => {
    const week = buildNutritionWeek({
      variants,
      history: [
        historyDay(LUNES, { consumed: consumed(2000, 3) }), // en la meta exacta
        historyDay(MARTES, { consumed: consumed(1500, 2) }), // bajo el 90%
        historyDay(MIERCOLES, { targets: null, consumed: consumed(1500, 2) }), // registro sin meta
      ],
      weekStartIso: LUNES,
      todayIso: JUEVES,
    })
    expect(week[0].rangeDot).toBe('in-range')
    expect(week[1].rangeDot).toBe('out-of-range')
    expect(week[2].rangeDot).toBe('logged')
    // Jueves es hoy ⇒ viernes y domingo son futuro: nada que contar.
    expect(week[4].rangeDot).toBe('none')
    expect(week[6].rangeDot).toBe('none')
  })

  it('HOY jamas se juzga por rango: logged con registro, none sin el (misma regla que la racha)', () => {
    const week = buildNutritionWeek({
      variants,
      history: [
        historyDay(MIERCOLES, { consumed: consumed(600, 1) }), // hoy, lejos del rango todavia
      ],
      weekStartIso: LUNES,
      todayIso: MIERCOLES,
    })
    expect(week[2].state).toBe('today')
    expect(week[2].rangeDot).toBe('logged')
    // El martes sin fila de historial: pasado sin registro.
    expect(week[1].rangeDot).toBe('none')
  })
})

// SPEC nutrition-week-view §«Regla cerrada 2026-08-22 — futuro visible, solo lectura».
// Origen: un alumno no podia ver que le tocaba comer el resto de la semana. La tira es el unico
// navegador de la semana, asi que el contrato es que las 7 celdas existan, esten pintadas y
// NINGUNA traiga superficie de escritura salvo hoy.
describe('futuro visible, solo lectura (22-08)', () => {
  it('las 7 celdas son seleccionables: fecha valida y etiquetas en todas, futuro incluido', () => {
    const week = buildNutritionWeek({ variants, weekStartIso: LUNES, todayIso: MARTES })
    expect(week).toHaveLength(7)
    for (const cell of week) {
      expect(cell.isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(cell.shortLabel.length).toBeGreaterThan(0)
      expect(cell.longLabel.length).toBeGreaterThan(0)
    }
    // Nada en la celda apaga un dia: el unico eje es `state`, y "future" es un modo de lectura.
    expect(week.filter((cell) => cell.state === 'future')).toHaveLength(5)
  })

  it('un dia futuro trae el plan PROYECTADO para poder mostrarlo en lectura', () => {
    const week = buildNutritionWeek({ variants, weekStartIso: LUNES, todayIso: LUNES })
    const sabadoCell = week[5]
    expect(sabadoCell.state).toBe('future')
    // La variante del sabado (match exacto de dow) y sus metas: es lo que la vista previa pinta.
    expect(sabadoCell.variant?.id).toBe('sa')
    expect(sabadoCell.targets?.calories).toBe(2600)
    expect(sabadoCell.targetsSource).toBe('projected')
    // Los demas dias futuros caen a la variante base, no quedan mudos.
    expect(week[4].variant?.id).toBe('base')
    expect(week[4].targetsSource).toBe('projected')
  })

  it('el futuro nunca trae superficie de escritura: sin consumo, sin snapshot y sin punto juzgado', () => {
    const week = buildNutritionWeek({
      variants,
      // Una fila "de manana" no deberia existir, pero si el cursor la trae NO se usa: mirar el
      // futuro jamas materializa ni muestra un registro (get_nutrition_today_v2 es volatile).
      history: [historyDay(SABADO, { activeEntryCount: 4, consumed: consumed(2400, 4) })],
      weekStartIso: LUNES,
      todayIso: MARTES,
    })
    for (const cell of week.slice(2)) {
      expect(cell.state).toBe('future')
      expect(cell.consumed).toBeNull()
      expect(cell.rangeDot).toBe('none')
      expect(cell.isLegacy).toBeUndefined()
    }
    // Lo que SI sobrevive de esa fila son las metas: `ensure_day_snapshot` puede materializar
    // hoy+1, y si ese snapshot existe es el que el alumno tendra (regla 2, "el snapshot gana").
    // El resto de los dias futuros, sin fila, sigue siendo proyeccion del plan vigente.
    expect(week[4].targetsSource).toBe('projected')
    expect(week[6].targetsSource).toBe('projected')
  })

  it('un plan que no prescribe ese dia no inventa la default ni en el futuro', () => {
    const soloSabado: Variant[] = [sabado]
    const week = buildNutritionWeek({ variants: soloSabado, weekStartIso: LUNES, todayIso: LUNES })
    expect(week[5].variant?.id).toBe('sa')
    expect(week[3].state).toBe('future')
    expect(week[3].variant).toBeNull()
    expect(week[3].targetsSource).toBe('none')
  })
})

// Puente "Ver el plan del lunes" (22-08): el dia PASADO muestra el resultado congelado, no la
// prescripcion, asi que se ofrece un salto al patron semanal vigente (tab Plan).
describe('puente al plan del dia', () => {
  it('nombra el dia en minuscula, con tilde', () => {
    const week = buildNutritionWeek({ variants, weekStartIso: LUNES, todayIso: DOMINGO })
    expect(formatNutritionWeekPlanLinkLabel(week[0])).toBe('Ver el plan del lunes')
    expect(formatNutritionWeekPlanLinkLabel(week[2])).toBe('Ver el plan del miércoles')
    expect(formatNutritionWeekPlanLinkLabel(week[5])).toBe('Ver el plan del sábado')
  })

  it('traslada un dia de otra semana al equivalente de la semana vigente', () => {
    // El tab Historial puede abrir un lunes de hace tres semanas; el Plan solo conoce la actual.
    expect(alignNutritionIsoToWeekOf('2026-07-06', MIERCOLES)).toBe(LUNES)
    expect(alignNutritionIsoToWeekOf('2026-07-12', MIERCOLES)).toBe(DOMINGO)
    // Un dia que ya esta en la semana ancla se devuelve tal cual.
    expect(alignNutritionIsoToWeekOf(VIERNES, MIERCOLES)).toBe(VIERNES)
  })

  it('sin fecha valida no inventa un dia', () => {
    expect(alignNutritionIsoToWeekOf(null, MIERCOLES)).toBeNull()
    expect(alignNutritionIsoToWeekOf('2026-13-40', MIERCOLES)).toBeNull()
    expect(alignNutritionIsoToWeekOf(LUNES, 'ayer')).toBeNull()
  })
})
