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

import { useMemo } from 'react'
import type {
  NutritionItemSubstitutionRead,
  NutritionPlanDraft,
  NutritionPlanReadModel,
} from '@eva/nutrition-v2'
import { FoodPickerPrefsProvider } from '../../coach/nutrition-v2/_components/food-picker/FoodPickerPrefsContext'
import {
  QuickEditProvider,
  type EditorCreationInput,
  type EditorTemplateInput,
} from '../../coach/nutrition-v2/[clientId]/_quick-edit/QuickEditProvider'
import { QuickEditPlanView } from '../../coach/nutrition-v2/[clientId]/_quick-edit/QuickEditPlanView'
import {
  draftToEditState,
  withSyntheticDraftIds,
} from '../../coach/nutrition-v2/[clientId]/_quick-edit/quick-edit-state'
import type { BuilderFood } from '../../coach/nutrition-v2/[clientId]/builder/_lib/draft-builder'

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
      // Segundo dia: habilita el menu por-dia (solo se pinta en multi-dia) para verificar
      // "Duplicar como…" (W2) en el harness.
      {
        id: '44444444-4444-4444-8444-555555555555',
        key: 'dow-6',
        label: 'Sábado',
        dayOfWeek: 6,
        isDefault: false,
        targets: {
          calories: 2400,
          proteinG: 170,
          carbsG: 240,
          fatsG: 75,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        mealSlots: [],
      },
    ],
    syncToken: 'harness-sync-token',
  }
}

const NO_SUBSTITUTIONS: NutritionItemSubstitutionRead[] = []

/** Read model SIN plan vigente: el modo creacion no depende de el (solo timezone/planId null). */
function buildEmptyPlanModel(): NutritionPlanReadModel {
  return { ...buildPlanModel(), plan: null, dayVariants: [], visibleNotes: null }
}

const HARNESS_FOOD: BuilderFood = {
  id: '88888888-8888-4888-8888-888888888888',
  name: 'Arroz integral',
  brand: null,
  calories: 360,
  proteinG: 7,
  carbsG: 76,
  fatsG: 2.5,
  fiberG: 4,
  servingSize: 100,
  servingUnit: 'g',
  category: 'cereal',
  media: null,
}

/** Draft estilo plantilla (contrato) para el modo creacion: 1 dia, 1 franja, 1 item. */
function buildCreationInput(): EditorCreationInput {
  const baseDraft: NutritionPlanDraft = {
    clientId: CLIENT_ID,
    name: 'Plantilla harness',
    strategy: 'structured',
    effectiveFrom: null,
    timezone: 'America/Santiago',
    permissions: {
      canRegisterFreely: true,
      canAdjustPrescribedQuantity: true,
      quantityAdjustmentPercent: null,
      canSubstitute: false,
      canMoveMealSlot: false,
      canSkipOptionalItems: true,
    },
    visibleNotes: 'Nota de la plantilla',
    privateNotes: null,
    protocolNotes: null,
    dayVariants: [
      {
        key: 'default',
        label: 'Todos los dias',
        dayOfWeek: null,
        default: true,
        targets: {
          calories: 2000,
          proteinG: 150,
          carbsG: 200,
          fatsG: 60,
          fiberG: null,
          sodiumMg: null,
          waterMl: null,
        },
        orderIndex: 0,
        mealSlots: [
          {
            code: 'slot-1',
            name: 'Almuerzo',
            startTime: '13:00',
            endTime: null,
            mode: 'anchor',
            required: true,
            targets: {},
            instructions: null,
            orderIndex: 0,
            items: [
              {
                foodId: HARNESS_FOOD.id,
                recipeId: null,
                customName: null,
                quantity: 150,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                orderIndex: 0,
              },
            ],
          },
        ],
      },
    ],
  }
  return {
    initialState: draftToEditState(
      baseDraft,
      { foodsById: { [HARNESS_FOOD.id]: HARNESS_FOOD } },
      { effectiveFrom: null },
    ),
    baseDraft,
    expectedCurrentVersionId: null,
  }
}

/**
 * Modo PLANTILLA (T3.2b): mismo baseDraft del modo creacion pero con `template` — abre como
 * EDICION de una plantilla existente (baseline = arbol hidratado, 0 cambios de entrada) y
 * `meta` SIN `effectiveFrom` (la card no debe pintar vigencia).
 */
function buildTemplateInput(): EditorTemplateInput {
  const { baseDraft } = buildCreationInput()
  // Ids sinteticos como la page real: sin ids, los contadores aparean cada fila contra si
  // misma como baja+alta y la plantilla abriria "con cambios". Generador DETERMINISTA: este
  // componente corre en SSR y en el cliente — ids random divergirian entre ambos renders
  // (hydration mismatch, familia EVA-NEXTJS-18).
  let seq = 0
  const templateDraft: NutritionPlanDraft = withSyntheticDraftIds(
    { ...baseDraft, name: 'Plantilla harness T3.2b' },
    () => `00000000-0000-4000-8000-00000000000${(seq += 1)}`,
  )
  return {
    templateId: '99999999-9999-4999-8999-999999999999',
    initialState: draftToEditState(
      templateDraft,
      { foodsById: { [HARNESS_FOOD.id]: HARNESS_FOOD } },
      {},
    ),
    baseDraft: templateDraft,
    description: 'Descripción harness',
  }
}

export function EditorHarness({ mode }: { mode: 'edit' | 'create' | 'template' }) {
  const isCreate = mode === 'create'
  const isTemplate = mode === 'template'
  // Identidad estable como en la page real (el server la manda una vez como prop).
  const creation = useMemo(() => (isCreate ? buildCreationInput() : null), [isCreate])
  const template = useMemo(() => (isTemplate ? buildTemplateInput() : null), [isTemplate])
  return (
    <FoodPickerPrefsProvider
      viewerCoachId={null}
      clientName={isTemplate ? null : 'Alumno Harness'}
      restrictions={[]}
      favoriteIds={[]}
    >
      <QuickEditProvider
        clientId={CLIENT_ID}
        clientName={isTemplate ? '' : 'Alumno Harness'}
        planModel={isCreate || isTemplate ? buildEmptyPlanModel() : buildPlanModel()}
        itemSubstitutions={NO_SUBSTITUTIONS}
        substitutionsLoadFailed={false}
        today={LOCAL_DATE}
        hasNutritionPro={false}
        editPlanMeta
        creation={creation}
        template={template}
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
