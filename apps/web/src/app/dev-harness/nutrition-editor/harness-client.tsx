'use client'

/**
 * HARNESS LOCAL (solo dev) — editor unico de nutricion (T3.x W1).
 *
 * Monta el stack REAL del editor (FoodPickerPrefsProvider + QuickEditProvider con
 * `editPlanMeta` + QuickEditPlanView) con un read model sintetico: sin auth, sin Supabase.
 * Sirve para verificar en local (Playwright headless) que la cabecera de metadatos edita
 * nombre/permisos, que el contador de cambios los cuenta y que la validacion local corta el
 * publish con nombre vacio — ANTES de tocar preview (regla del owner, patron nutrition-tabs).
 *
 * Publicar de verdad NO funciona aca (la server action exige sesion): el harness cubre estado
 * y UI. NO llega a produccion: la page hace notFound() fuera de development.
 */

import type { NutritionItemSubstitutionRead, NutritionPlanReadModel } from '@eva/nutrition-v2'
import { FoodPickerPrefsProvider } from '../../coach/nutrition-v2/_components/food-picker/FoodPickerPrefsContext'
import { QuickEditProvider } from '../../coach/nutrition-v2/[clientId]/_quick-edit/QuickEditProvider'
import { QuickEditPlanView } from '../../coach/nutrition-v2/[clientId]/_quick-edit/QuickEditPlanView'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const LOCAL_DATE = new Date().toISOString().slice(0, 10)

function buildPlanModel(): NutritionPlanReadModel {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    asOfDate: LOCAL_DATE,
    timezone: 'America/Santiago',
    plan: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Plan harness',
      strategy: 'structured',
      versionId: '55555555-5555-4555-8555-555555555555',
      versionNumber: 1,
      status: 'published',
      effectiveFrom: LOCAL_DATE,
      effectiveTo: null,
    },
    visibleNotes: 'Nota visible de prueba',
    protocolNotes: null,
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    dayVariants: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        isDefault: true,
        targets: {
          calories: 2200,
          proteinG: 160,
          carbsG: 220,
          fatsG: 70,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        mealSlots: [
          {
            id: '66666666-6666-4666-8666-666666666666',
            code: 'slot-1',
            name: 'Desayuno',
            startTime: '08:00',
            endTime: null,
            mode: 'anchor',
            required: false,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                id: '77777777-7777-4777-8777-777777777777',
                foodId: '88888888-8888-4888-8888-888888888888',
                recipeId: null,
                name: 'Avena',
                brand: null,
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 300, proteinG: 10.4, carbsG: 53, fatsG: 5.6, fiberG: 8 },
              },
            ],
          },
        ],
      },
    ],
    syncToken: 'harness-sync-token',
  }
}

const NO_SUBSTITUTIONS: NutritionItemSubstitutionRead[] = []

export function EditorHarness() {
  return (
    <FoodPickerPrefsProvider
      viewerCoachId={null}
      clientName="Alumno Harness"
      restrictions={[]}
      favoriteIds={[]}
    >
      <QuickEditProvider
        clientId={CLIENT_ID}
        clientName="Alumno Harness"
        planModel={buildPlanModel()}
        itemSubstitutions={NO_SUBSTITUTIONS}
        substitutionsLoadFailed={false}
        today={LOCAL_DATE}
        hasNutritionPro={false}
        editPlanMeta
        onExit={() => {
          // En el harness no hay "ficha" a la que volver: recargar re-hidrata limpio.
          window.location.reload()
        }}
      >
        <QuickEditPlanView />
      </QuickEditProvider>
    </FoodPickerPrefsProvider>
  )
}
