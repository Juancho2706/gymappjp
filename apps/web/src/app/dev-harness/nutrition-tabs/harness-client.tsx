'use client'

/**
 * HARNESS LOCAL (solo dev) — repro del bug "marcar → tabs muertos" (T2.7 H12+).
 *
 * Monta el TodayExperience REAL con un read model sintético y un fetch() interceptado que
 * emula el puente /api/student/nutrition-v2 en memoria (sin auth, sin Supabase). Permite
 * reproducir y verificar el wedge del App Router en local ANTES de tocar preview.
 *
 * NO llega a producción: la page que lo monta hace notFound() fuera de development.
 */

import Link from 'next/link'
import { TodayExperience } from '../../c/[coach_slug]/nutrition-v2/_components/TodayExperience'
import { buildOptimisticIntakeEntry } from '../../c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic'
import type { NutritionTodayReadModel } from '@eva/nutrition-v2'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const LOCAL_DATE = new Date().toISOString().slice(0, 10)

const ITEMS = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    foodId: '44444444-4444-4444-8444-444444444444',
    recipeId: null,
    name: 'Pechuga de pollo',
    brand: null,
    quantity: 200,
    unit: 'g',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    macros: { calories: 330, proteinG: 62, carbsG: 0, fatsG: 7.2, fiberG: null },
  },
  {
    id: '22222222-2222-4222-8222-333333333333',
    foodId: '44444444-4444-4444-8444-555555555555',
    recipeId: null,
    name: 'Avena',
    brand: 'Lider',
    quantity: 100,
    unit: 'ml',
    minimumQuantity: null,
    maximumQuantity: null,
    optional: false,
    substitutionGroupId: null,
    notes: null,
    macros: { calories: 395, proteinG: 11, carbsG: 69, fatsG: 9, fiberG: null },
  },
] satisfies NutritionTodayReadModel['mealSlots'][number]['prescriptionItems']

/** "Servidor" en memoria: las entries registradas viven acá entre requests del mock. */
const serverEntries: NutritionTodayReadModel['mealSlots'][number]['intakeItems'][number][] = []

function buildToday(): NutritionTodayReadModel {
  const consumed = serverEntries.reduce(
    (sum, entry) => ({
      calories: sum.calories + entry.totals.calories,
      proteinG: sum.proteinG + entry.totals.proteinG,
      carbsG: sum.carbsG + entry.totals.carbsG,
      fatsG: sum.fatsG + entry.totals.fatsG,
      fiberG: sum.fiberG + entry.totals.fiberG,
      entryCount: sum.entryCount + 1,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 0 },
  )
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    localDate: LOCAL_DATE,
    timezone: 'America/Santiago',
    snapshotId: '88888888-8888-4888-8888-888888888888',
    plan: null,
    targets: { calories: 2950, proteinG: 290, carbsG: 320, fatsG: 120, fiberG: null, sodiumMg: null, waterMl: null },
    consumed,
    remaining: {
      calories: 2950 - consumed.calories,
      proteinG: 290 - consumed.proteinG,
      carbsG: 320 - consumed.carbsG,
      fatsG: 120 - consumed.fatsG,
      fiberG: null,
      sodiumMg: null,
      waterMl: null,
    },
    permissions: {
      canRegisterFreely: false,
      canAdjustPrescribedQuantity: false,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    mealSlots: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        code: 'lunch',
        name: 'Almuerzo',
        startTime: '13:00',
        endTime: null,
        mode: 'anchor',
        required: true,
        instructions: null,
        targets: {},
        prescriptionItems: ITEMS,
        intakeItems: [...serverEntries],
      },
    ],
    unassignedIntake: [],
    syncToken: 'harness',
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Intercepta SOLO el puente del alumno; el resto de la red sigue intacta. */
if (typeof window !== 'undefined' && !(window as { __nutriHarness?: boolean }).__nutriHarness) {
  ;(window as { __nutriHarness?: boolean }).__nutriHarness = true
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes('/api/student/nutrition-v2')) return realFetch(input, init)
    const body = JSON.parse((init?.body as string) ?? '{}') as { op?: string; input?: unknown }
    console.warn('[harness] op:', body.op)
    await delay(600)
    const reply = (payload: unknown) =>
      new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
    switch (body.op) {
      case 'record': {
        const { payload } = body.input as { payload: Parameters<typeof buildOptimisticIntakeEntry>[0]['payload'] }
        const item = ITEMS.find((candidate) => candidate.id === payload.prescriptionItemId)
        const entry = buildOptimisticIntakeEntry({
          payload,
          totals: {
            calories: item?.macros.calories ?? 100,
            proteinG: item?.macros.proteinG ?? 0,
            carbsG: item?.macros.carbsG ?? 0,
            fatsG: item?.macros.fatsG ?? 0,
            fiberG: item?.macros.fiberG ?? 0,
          },
        })
        serverEntries.push(entry)
        return reply({ ok: true, id: entry.id })
      }
      case 'void': {
        const { payload } = body.input as { payload: { entryId: string } }
        const index = serverEntries.findIndex((entry) => entry.id === payload.entryId)
        if (index >= 0) serverEntries.splice(index, 1)
        return reply({ ok: true, id: payload.entryId })
      }
      case 'fetchToday':
        return reply({ ok: true, today: buildToday() })
      case 'favoriteIds':
        return reply({ ok: true, ids: [] })
      case 'historyWeeks':
        return reply({ ok: true, weeks: [], nextCursor: null })
      default:
        return reply({ ok: true })
    }
  }
}

export function HarnessView({ view }: { view: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <nav className="flex gap-3 rounded-card border border-border-subtle p-2">
        {[
          { href: '/dev-harness/nutrition-tabs', label: 'Hoy' },
          { href: '/dev-harness/nutrition-tabs?view=plan', label: 'Plan' },
          { href: '/dev-harness/nutrition-tabs?view=history', label: 'Historial' },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            className="rounded-control border border-border-default px-4 py-2 text-sm font-semibold"
          >
            {tab.label}
          </Link>
        ))}
        <span data-harness-view className="ml-auto px-4 py-2 text-sm font-bold">
          vista: {view}
        </span>
      </nav>
      {view === 'today' ? (
        <TodayExperience today={buildToday()} clientId={CLIENT_ID} scanHref="#" clientName="Harness QA" />
      ) : (
        <div data-harness-arrived className="rounded-card border border-border-default p-10 text-2xl font-bold">
          LLEGUÉ A: {view}
        </div>
      )}
    </div>
  )
}
