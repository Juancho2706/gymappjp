import { describe, expect, it } from 'vitest'
import type {
  NutritionClientDetailReadModel,
  NutritionHistoryDay,
} from '@eva/nutrition-v2'
import { summarizeWeek } from '@/components/nutrition/adherence-week'
import {
  buildNutritionTabV2ViewModel,
  computeNutritionStreakDays,
  computeNutritionWeeklyAdherence,
} from './nutritionTabV2.logic'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
// Miércoles: mismo día de semana que el mockup aprobado "flujos podados" sección 01 frame 3
// ("Miércoles 29 · en curso", "2 días cumplidos · 1 parcial · racha 4").
const TODAY_ISO = '2026-07-29'

function makeDay(
  localDate: string,
  opts: { calories: number; target?: number; entries?: number },
): NutritionHistoryDay {
  return {
    localDate,
    snapshotId: null,
    planVersionId: null,
    strategy: 'structured',
    targets: {
      calories: opts.target ?? 2400,
      proteinG: 180,
      carbsG: 250,
      fatsG: 70,
      fiberG: null,
      sodiumMg: null,
      waterMl: null,
    },
    consumed: {
      calories: opts.calories,
      proteinG: 100,
      carbsG: 150,
      fatsG: 40,
      fiberG: 10,
      entryCount: opts.entries ?? 1,
    },
    activeEntryCount: opts.entries ?? 1,
    correctionCount: 0,
    legacyCompletionCount: 0,
    legacyDisclosure: null,
    lastRecordedAt: null,
  } as NutritionHistoryDay
}

/** Fixture mínimo del read model: el mapper solo lee un subconjunto; casteamos para no
 *  reconstruir cada campo del schema (la validez zod se prueba en el read service). */
function makeDetail(opts: {
  hasAnyPlan: boolean
  hasActivePlan: boolean
  todayCalories?: number
  todayTarget?: number
  todayEntryCount?: number
  /** `effectiveFrom` del plan vigente (default: antes de la semana en curso). */
  effectiveFrom?: string
  /** Variantes del plan (para las metas por día del PDF). */
  dayVariants?: { key: string; label: string; dayOfWeek: number | null; isDefault: boolean; calories: number | null }[]
}): NutritionClientDetailReadModel {
  const activePlan = opts.hasActivePlan
    ? {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Plan hipertrofia',
        strategy: 'structured' as const,
        versionId: '33333333-3333-4333-8333-333333333333',
        versionNumber: 3,
        status: 'published' as const,
        effectiveFrom: opts.effectiveFrom ?? '2026-07-01',
        effectiveTo: null,
      }
    : null
  const anyPlan = opts.hasAnyPlan
    ? {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Plan hipertrofia',
        strategy: 'structured' as const,
        versionId: '33333333-3333-4333-8333-333333333333',
        versionNumber: 3,
        status: 'published' as const,
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
      }
    : null

  return {
    schemaVersion: 1,
    generatedAt: '2026-07-29T12:00:00.000Z',
    client: { id: CLIENT_ID, fullName: 'Catalina Araya' },
    today: {
      plan: activePlan,
      targets: {
        calories: opts.todayTarget ?? 2400,
        proteinG: 180,
        carbsG: 250,
        fatsG: 70,
        fiberG: null,
        sodiumMg: null,
        waterMl: null,
      },
      consumed: {
        calories: opts.todayCalories ?? 0,
        proteinG: 90,
        carbsG: 130,
        fatsG: 35,
        fiberG: 12,
        entryCount: opts.todayEntryCount ?? 0,
      },
      remaining: {
        calories: 0,
        proteinG: null,
        carbsG: null,
        fatsG: null,
        fiberG: null,
        sodiumMg: null,
        waterMl: null,
      },
      mealSlots: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    },
    plan: {
      plan: anyPlan,
      dayVariants: (opts.dayVariants ?? []).map((v) => ({
        id: `variant-${v.key}`,
        key: v.key,
        label: v.label,
        dayOfWeek: v.dayOfWeek,
        isDefault: v.isDefault,
        targets: {
          calories: v.calories,
          proteinG: null,
          carbsG: null,
          fatsG: null,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        mealSlots: [],
      })),
      visibleNotes: 'Prioriza proteína en el desayuno.',
    },
    recentDays: [],
    privateNote: null,
  } as unknown as NutritionClientDetailReadModel
}

describe('buildNutritionTabV2ViewModel', () => {
  it('mapea semana + hoy + racha, reproduciendo el mockup aprobado (2 cumplidos · 1 parcial · racha 4)', () => {
    const detail = makeDetail({
      hasAnyPlan: true,
      hasActivePlan: true,
      todayCalories: 1780,
      todayTarget: 2400,
      todayEntryCount: 2,
    })
    const recentDaysForDisplay = [
      makeDay('2026-07-28', { calories: 2300 }), // martes: en rango -> cumplido
      makeDay('2026-07-27', { calories: 2350 }), // lunes: en rango -> cumplido
      makeDay('2026-07-26', { calories: 2200 }), // domingo (semana previa): en rango, solo racha
    ]

    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay,
    })

    expect(vm.clientName).toBe('Catalina Araya')
    expect(vm.hasPlan).toBe(true)
    expect(vm.hasActivePlan).toBe(true)
    expect(vm.strategy).toBe('structured')
    expect(vm.detailHref).toBe(`/coach/nutrition-v2/${CLIENT_ID}`)
    expect(vm.builderHref).toBe(`/coach/nutrition-v2/${CLIENT_ID}/builder`)
    expect(vm.builderCtaLabel).toBe('Nueva versión')

    expect(vm.week).toHaveLength(7)
    expect(vm.week.map((d) => [d.isoDate, d.status])).toEqual([
      ['2026-07-27', 'done'],
      ['2026-07-28', 'done'],
      ['2026-07-29', 'partial'],
      ['2026-07-30', 'future'],
      ['2026-07-31', 'future'],
      ['2026-08-01', 'future'],
      ['2026-08-02', 'future'],
    ])
    expect(vm.week.find((d) => d.isoDate === TODAY_ISO)?.isToday).toBe(true)

    expect(vm.today.calories).toEqual({ consumed: 1780, target: 2400 })
    expect(vm.completedCount).toBe(2)
    expect(vm.partialCount).toBe(1)
    // Mié(hoy, con registro) + Mar + Lun + Dom = 4, igual que el mockup.
    expect(vm.streakDays).toBe(4)

    // Los puntos del primitivo compartido: cifras REALES por día, recortadas a la semana Lu-Do
    // (el domingo 26 alimenta la racha pero es de la semana previa ⇒ fuera de la fila) y con HOY
    // inyectado desde `detail.today` (nunca viaja en `recentDays`).
    expect(vm.weekAnchorIso).toBe('2026-08-02')
    expect(vm.adherenceWeek).toEqual([
      { date: '2026-07-27', entryCount: 1, consumedCalories: 2350, targetCalories: 2400 },
      { date: '2026-07-28', entryCount: 1, consumedCalories: 2300, targetCalories: 2400 },
      { date: '2026-07-29', entryCount: 2, consumedCalories: 1780, targetCalories: 2400 },
    ])
  })

  // Coherencia hub ↔ perfil ↔ ficha: la lectura textual de los puntos ("X/7 registrados ·
  // Y/Z en meta") tiene que salir exactamente igual que los estados de la tira de la card.
  it('la semana de los puntos cuenta lo MISMO que los estados del view model', () => {
    const detail = makeDetail({
      hasAnyPlan: true,
      hasActivePlan: true,
      todayCalories: 1780, // 74 % -> registrado, fuera de meta
      todayTarget: 2400,
      todayEntryCount: 2,
    })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay: [
        makeDay('2026-07-28', { calories: 2300 }),
        makeDay('2026-07-27', { calories: 2350 }),
      ],
    })

    const summary = summarizeWeek(vm.adherenceWeek)
    expect(summary.registered).toBe(vm.completedCount + vm.partialCount)
    expect(summary.inRange).toBe(vm.completedCount)
    expect(summary).toEqual({ registered: 3, inRange: 2, evaluable: 3 })
  })

  // Rescate 2026-07-29 (auditoría §2.2): la señal que consumen hero / anillo / pill / badge /
  // attentionScore / PDF sale de acá. Los dos casos de abajo son el contrato de honestidad.
  it('alumno V2 con la semana verde -> adherencia 100 % y SIN riesgo (nada de "en riesgo" con V1 en 0)', () => {
    const detail = makeDetail({
      hasAnyPlan: true,
      hasActivePlan: true,
      todayCalories: 2350, // en rango (90-110 % de 2400)
      todayTarget: 2400,
      todayEntryCount: 3,
      dayVariants: [
        { key: 'base', label: 'Base', dayOfWeek: null, isDefault: true, calories: 2400 },
        { key: 'sabado', label: 'Sábado', dayOfWeek: 6, isDefault: false, calories: 2800 },
      ],
    })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO, // miércoles
      recentDaysForDisplay: [
        makeDay('2026-07-28', { calories: 2400 }), // martes en rango
        makeDay('2026-07-27', { calories: 2300 }), // lunes en rango
      ],
    })

    // Lun + Mar cerrados en rango + hoy con registro en rango = 3/3.
    expect(vm.weeklyTrackedDays).toBe(3)
    expect(vm.weeklyInRangeDays).toBe(3)
    expect(vm.weeklyInRangePct).toBe(100)
    expect(vm.isAtRisk).toBe(false)
    expect(vm.planName).toBe('Plan hipertrofia')
    expect(vm.todayPct).toBe(98)
    expect(vm.todayMacroTargets.calories).toBe(2400)
    expect(vm.todaySlotCount).toBe(3)
    // Metas por día para el PDF: la variante base primero, después los días específicos.
    expect(vm.dayTargets).toEqual([
      { label: 'Base', calories: 2400 },
      { label: 'Sábado', calories: 2800 },
    ])
  })

  it('sin plan V2 vigente -> señal NEUTRA (todo null/0, sin riesgo): la ficha la omite', () => {
    const detail = makeDetail({
      hasAnyPlan: true,
      hasActivePlan: false,
      todayCalories: 0,
      todayTarget: 2400,
    })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay: [],
    })

    expect(vm.isAtRisk).toBeNull()
    expect(vm.weeklyInRangePct).toBeNull()
    expect(vm.weeklyTrackedDays).toBe(0)
    expect(vm.weeklyInRangeDays).toBe(0)
    expect(vm.todayPct).toBeNull()
    expect(vm.todayMacroTargets).toEqual({
      calories: null,
      proteinG: null,
      carbsG: null,
      fatsG: null,
    })
    expect(vm.todaySlotCount).toBe(0)
    expect(vm.planName).toBeNull()
    expect(vm.dayTargets).toEqual([])
  })

  it('semana con dos días fuera de rango -> riesgo (33 % < 60 %)', () => {
    const detail = makeDetail({
      hasAnyPlan: true,
      hasActivePlan: true,
      todayCalories: 400,
      todayTarget: 2400,
      todayEntryCount: 1,
    })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay: [
        makeDay('2026-07-28', { calories: 900 }), // martes muy abajo
        makeDay('2026-07-27', { calories: 2400 }), // lunes en rango
      ],
    })
    expect(vm.weeklyInRangePct).toBe(33)
    expect(vm.isAtRisk).toBe(true)
  })

  it('sin plan vigente hoy -> semana vacía, racha 0, CTA "Nueva versión" si hubo plan histórico', () => {
    const detail = makeDetail({ hasAnyPlan: true, hasActivePlan: false })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay: [],
    })
    expect(vm.hasPlan).toBe(true)
    expect(vm.hasActivePlan).toBe(false)
    expect(vm.strategy).toBeNull()
    expect(vm.week).toEqual([])
    // Sin plan vigente no hay fila de puntos que pintar (ni ancla): la card muestra el empty-state.
    expect(vm.adherenceWeek).toEqual([])
    expect(vm.weekAnchorIso).toBeNull()
    expect(vm.streakDays).toBe(0)
    expect(vm.completedCount).toBe(0)
    expect(vm.partialCount).toBe(0)
    expect(vm.builderCtaLabel).toBe('Nueva versión')
  })

  it('sin ningún plan -> CTA "Crear plan"', () => {
    const detail = makeDetail({ hasAnyPlan: false, hasActivePlan: false })
    const vm = buildNutritionTabV2ViewModel({
      clientId: CLIENT_ID,
      detail,
      todayIso: TODAY_ISO,
      recentDaysForDisplay: [],
    })
    expect(vm.hasPlan).toBe(false)
    expect(vm.builderCtaLabel).toBe('Crear plan')
    expect(vm.week).toEqual([])
  })
})

describe('computeNutritionWeeklyAdherence', () => {
  const week = [
    { isoDate: '2026-07-27', shortLabel: 'Lu', status: 'done' as const, isToday: false },
    { isoDate: '2026-07-28', shortLabel: 'Ma', status: 'none' as const, isToday: false },
    { isoDate: '2026-07-29', shortLabel: 'Mi', status: 'none' as const, isToday: true },
    { isoDate: '2026-07-30', shortLabel: 'Ju', status: 'future' as const, isToday: false },
  ]

  it('un día pasado SIN registro cuenta como fuera de rango (el plan estaba vigente)', () => {
    expect(
      computeNutritionWeeklyAdherence({ week, planEffectiveFrom: null, todayHasIntake: false })
    ).toEqual({ pct: 50, inRangeDays: 1, trackedDays: 2 })
  })

  it('hoy sin registro no entra al denominador; con registro sí', () => {
    expect(
      computeNutritionWeeklyAdherence({ week, planEffectiveFrom: null, todayHasIntake: true })
        .trackedDays
    ).toBe(3)
  })

  it('un plan publicado hoy NO reprueba los días previos (sin dato -> pct null)', () => {
    expect(
      computeNutritionWeeklyAdherence({
        week,
        planEffectiveFrom: '2026-07-29',
        todayHasIntake: false,
      })
    ).toEqual({ pct: null, inRangeDays: 0, trackedDays: 0 })
  })
})

describe('computeNutritionStreakDays', () => {
  it('cuenta hoy + días consecutivos hacia atrás', () => {
    const streak = computeNutritionStreakDays({
      recentDays: [
        makeDay('2026-07-28', { calories: 2000 }),
        makeDay('2026-07-27', { calories: 2000 }),
      ],
      todayIso: TODAY_ISO,
      todayHasIntake: true,
    })
    expect(streak).toBe(3)
  })

  it('un día sin registro corta la racha', () => {
    const streak = computeNutritionStreakDays({
      recentDays: [
        makeDay('2026-07-28', { calories: 0, entries: 0 }),
        makeDay('2026-07-27', { calories: 2000 }),
      ],
      todayIso: TODAY_ISO,
      todayHasIntake: true,
    })
    expect(streak).toBe(1)
  })

  it('hoy sin registro todavía NO corta la racha de días anteriores', () => {
    const streak = computeNutritionStreakDays({
      recentDays: [
        makeDay('2026-07-28', { calories: 2000 }),
        makeDay('2026-07-27', { calories: 2000 }),
      ],
      todayIso: TODAY_ISO,
      todayHasIntake: false,
    })
    expect(streak).toBe(2)
  })

  it('sin ningún día registrado -> racha 0', () => {
    expect(
      computeNutritionStreakDays({ recentDays: [], todayIso: TODAY_ISO, todayHasIntake: false }),
    ).toBe(0)
  })
})
