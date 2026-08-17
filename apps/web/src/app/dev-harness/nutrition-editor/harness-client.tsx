'use client'

/**
 * HARNESS LOCAL (solo dev) — editor unico de nutricion (T3.x W1 + T3.v Cabina V0.4).
 *
 * Monta el stack REAL del editor (FoodPickerPrefsProvider + QuickEditProvider con
 * `editPlanMeta` + QuickEditPlanView) con un read model sintetico: sin auth, sin Supabase.
 * Sirve para verificar en local (Playwright headless) que la cabecera de metadatos edita
 * nombre/permisos, que el contador de cambios los cuenta y que la validacion local corta el
 * publish con nombre vacio — ANTES de tocar preview (regla del owner, patron nutrition-tabs).
 *
 * T3.v Cabina V0.4: el draft semilla del modo `edit` quedo ENRIQUECIDO (2 dias, 4 franjas)
 * para que la pasada visual tenga con que trabajar: items con y sin foto de producto
 * (`media`), porciones (franja Almuerzo), sustituciones (⇄, Avena y Salmon), un item con
 * macros editadas a mano (Arroz integral — no calzan con el escalado limpio de 100 g), un
 * item libre (Batido de proteina casera) y un item sin macros registradas (Cafe negro).
 * `?stories=1` (ver page.tsx) monta en cambio `MacroSparkStories`, la vista aislada del
 * spark/popover — ver ese archivo.
 *
 * Publicar de verdad NO funciona aca (la server action exige sesion): el harness cubre estado
 * y UI. NO llega a produccion: la page hace notFound() fuera de development.
 */

import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import type {
  FoodMediaRead,
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
} from '@eva/nutrition-v2'
import type { BuilderFood } from '@eva/nutrition-v2'
import type { TourId } from '@/components/nutrition-v2'
import { AppSeal } from '@/components/AppSeal'
import { buildSealCssVars } from '@/lib/seal-vars'
import { MacroSparkStories } from './macro-spark-stories'
import { TourStories } from './tour-stories'

const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const LOCAL_DATE = new Date().toISOString().slice(0, 10)
/** Fecha fija (no `Date.now()`) para no divergir entre el render de servidor y el de cliente. */
const MEDIA_UPDATED_AT = '2026-08-01T00:00:00.000Z'

/** Foto REAL de producto (bucket publico `food-media`), forma completa de `FoodMediaRead`. */
function productMedia(id: string, objectPath: string): FoodMediaRead {
  return {
    id,
    kind: 'product_photo',
    bucket: 'food-media',
    objectPath,
    version: 1,
    width: 640,
    height: 640,
    mimeType: 'image/webp',
    blurhash: null,
    license: 'eva_owned',
    sourceUrl: null,
    attribution: null,
    updatedAt: MEDIA_UPDATED_AT,
  }
}

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
          fiberG: 28,
          sodiumMg: 2300,
          waterMl: 2500,
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
                // Con foto de producto + sustitucion autorizada (⇄1).
                id: '77777777-7777-4777-8777-777777777777',
                foodId: '88888888-8888-4888-8888-888888888888',
                recipeId: null,
                name: 'Avena tradicional',
                brand: 'Quaker',
                quantity: 80,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 300, proteinG: 10.4, carbsG: 53, fatsG: 5.6, fiberG: 8 },
                media: productMedia('cccccccc-cccc-4ccc-8ccc-cccccccccc01', 'cl/avena-quaker.webp'),
                category: 'carbohidrato',
              },
              {
                // Item LIBRE (sin foodId/recipeId): sin foto, macros propias.
                id: '77777777-7777-4777-8777-000000000001',
                foodId: null,
                recipeId: null,
                name: 'Batido de proteína casero',
                brand: null,
                quantity: 300,
                unit: 'ml',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 220, proteinG: 32, carbsG: 14, fatsG: 3, fiberG: null },
                media: null,
                category: null,
              },
            ],
          },
          {
            id: '66666666-6666-4666-8666-777777777777',
            code: 'slot-2',
            name: 'Almuerzo',
            startTime: '13:00',
            endTime: null,
            mode: 'anchor',
            required: true,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                // Con foto, macros normales.
                id: '77777777-7777-4777-8777-000000000002',
                foodId: '88888888-8888-4888-8888-000000000002',
                recipeId: null,
                name: 'Pechuga de pollo',
                brand: 'Ariztia',
                quantity: 150,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 247, proteinG: 46.5, carbsG: 0, fatsG: 5.4, fiberG: 0 },
                media: productMedia('cccccccc-cccc-4ccc-8ccc-cccccccccc02', 'cl/pechuga-pollo-ariztia.webp'),
                category: 'proteina',
              },
              {
                // Macros EDITADAS a mano por el coach: no calzan con el escalado limpio de
                // 100 g (180 g de este arroz a 360 kcal/100 g darian 648 kcal, no 610).
                id: '77777777-7777-4777-8777-000000000003',
                foodId: '88888888-8888-4888-8888-000000000003',
                recipeId: null,
                name: 'Arroz integral',
                brand: 'Tucapel',
                quantity: 180,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 610, proteinG: 14, carbsG: 128, fatsG: 6, fiberG: 5 },
                media: productMedia('cccccccc-cccc-4ccc-8ccc-cccccccccc03', 'cl/arroz-integral-tucapel.webp'),
                category: 'carbohidrato',
              },
              {
                // SIN foto de producto (media null): cae al icono de categoria.
                id: '77777777-7777-4777-8777-000000000004',
                foodId: '88888888-8888-4888-8888-000000000005',
                recipeId: null,
                name: 'Ensalada mixta',
                brand: null,
                quantity: 120,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: true,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 45, proteinG: 2, carbsG: 8, fatsG: 0.5, fiberG: 3 },
                media: null,
                category: 'verdura',
              },
            ],
            // Porciones (SPEC R2): una franja con target de intercambio (grupo Verduras).
            exchangeTargets: [
              {
                id: '99999999-1111-4111-8111-111111111111',
                exchangeGroupId: '99999999-1111-4111-8111-111111111111',
                groupCode: 'VER',
                groupName: 'Verduras',
                color: '#2DD4BF',
                portions: 1.5,
                notes: null,
                orderIndex: 0,
                ref: { calories: 25, proteinG: 2, carbsG: 5, fatsG: 0 },
                composedOf: null,
                macrosConfirmed: true,
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
        mealSlots: [
          {
            id: '66666666-6666-4666-8666-aaaaaaaaaaaa',
            code: 'slot-3',
            name: 'Colación',
            startTime: '16:00',
            endTime: null,
            mode: 'flexible',
            required: false,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                // Con foto de producto.
                id: '77777777-7777-4777-8777-000000000005',
                foodId: '88888888-8888-4888-8888-000000000006',
                recipeId: null,
                name: 'Yogur griego natural',
                brand: 'Oikos',
                quantity: 170,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 100, proteinG: 17, carbsG: 6, fatsG: 0.5, fiberG: 0 },
                media: productMedia('cccccccc-cccc-4ccc-8ccc-cccccccccc04', 'cl/yogur-griego-oikos.webp'),
                category: 'lacteo',
              },
            ],
          },
          {
            id: '66666666-6666-4666-8666-bbbbbbbbbbbb',
            code: 'slot-4',
            name: 'Cena',
            startTime: '20:00',
            endTime: null,
            mode: 'anchor',
            required: true,
            instructions: null,
            targets: {},
            prescriptionItems: [
              {
                // SIN macros registradas (el coach lo agrego sin completar la ficha): la
                // barra del spark queda vacia, solo el fondo hundido.
                id: '77777777-7777-4777-8777-000000000006',
                foodId: '88888888-8888-4888-8888-000000000007',
                recipeId: null,
                name: 'Café negro',
                brand: null,
                quantity: 200,
                unit: 'ml',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: true,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: null, proteinG: null, carbsG: null, fatsG: null, fiberG: null },
                media: null,
                category: 'bebida',
              },
              {
                // SIN foto + sustitucion autorizada (⇄1).
                id: '77777777-7777-4777-8777-000000000007',
                foodId: '88888888-8888-4888-8888-000000000008',
                recipeId: null,
                name: 'Salmón grillado',
                brand: null,
                quantity: 160,
                unit: 'g',
                minimumQuantity: null,
                maximumQuantity: null,
                optional: false,
                substitutionGroupId: null,
                notes: null,
                macros: { calories: 280, proteinG: 34, carbsG: 0, fatsG: 15, fiberG: 0 },
                media: null,
                category: 'proteina',
              },
            ],
          },
        ],
      },
    ],
    syncToken: 'harness-sync-token',
  }
}

/** Reemplazos autorizados (F-02): Avena (Desayuno) y Salmón (Cena) tienen uno cada uno. */
const HARNESS_SUBSTITUTIONS: NutritionItemSubstitutionRead[] = [
  {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    prescriptionItemId: '77777777-7777-4777-8777-777777777777',
    foodId: '88888888-8888-4888-8888-000000000009',
    recipeId: null,
    name: 'Avena instantánea',
    brand: 'Quaker',
    quantity: 80,
    unit: 'g',
    macros: { calories: 296, proteinG: 9.9, carbsG: 54.8, fatsG: 5.3, fiberG: 6.5 },
  },
  {
    id: 'aaaaaaaa-2222-4222-8222-222222222222',
    prescriptionItemId: '77777777-7777-4777-8777-000000000007',
    foodId: '88888888-8888-4888-8888-00000000000a',
    recipeId: null,
    name: 'Atún en agua',
    brand: 'Robinson Crusoe',
    quantity: 120,
    unit: 'g',
    macros: { calories: 130, proteinG: 28, carbsG: 0, fatsG: 1, fiberG: 0 },
  },
]

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

/**
 * Toggle de tema (V0.4): alterna la clase `dark` en `<html>` via next-themes. Guard de
 * `mounted` para no divergir del render de servidor (mismo patron que `ThemeToggle.tsx`
 * de produccion — evita la familia de hydration mismatch EVA-NEXTJS-18 Y el parpadeo de
 * la etiqueta mientras `resolvedTheme` sigue `undefined` en el primer render de cliente).
 */
function HarnessThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === 'dark'
  return (
    // Debajo de la cinta/header (T3.v V2.1): en `top-2` este toggle del harness quedaba ENCIMA
    // del CTA "Publicar cambios" de la cinta ≥1024 — tapaba la captura y se comía los clicks de
    // Playwright. Es una afordancia solo-dev: se corre fuera de la zona de acciones.
    <div className="fixed right-2 top-16 z-[500]">
      <button
        type="button"
        onClick={() => setTheme(isDark ? 'light' : 'dark')}
        className="rounded-control border border-border-default bg-surface-card px-2.5 py-1.5 text-[11px] font-semibold text-strong shadow-sm hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Tema: {isDark ? 'oscuro' : 'claro'}
      </button>
    </div>
  )
}

/**
 * Escenario del Sello (S1.2/S2.2, SPEC `eva-seal-background`): con `?seal=1` la maqueta
 * activa se envuelve acá — publica el par `--seal-p-rgb`/`--seal-s-rgb` en `:root`/`.dark`
 * EXACTAMENTE como los layouts de producción (misma `buildSealCssVars`: par `sealPair`
 * derivado — sin preset en el harness — y pintado claro del blob 2) y monta `AppSeal b`.
 * `isolate`: stacking context propio para que el `-z-10` del sello pinte sobre el fondo
 * opaco del body y bajo la maqueta (mismo requisito que en los shells). En `?mode=edit`
 * el overlay del editor (opaco, con su capa propia de solo-grano) TAPA los blobs — eso
 * es fiel a producción (D2); las stories/tour sí dejan los blobs a la vista.
 */
function SealStage({ brand, children }: { brand: string; children: React.ReactNode }) {
  const vars = useMemo(
    () => buildSealCssVars({ lightBrandColor: brand, darkBrandColor: brand, themePresetKey: null }),
    [brand],
  )
  return (
    <div className="isolate">
      <style
        dangerouslySetInnerHTML={{
          __html:
            `:root{--seal-p-rgb:${vars.light.primaryRgb};--seal-s-rgb:${vars.light.secondaryRgb};}` +
            `.dark{--seal-p-rgb:${vars.dark.primaryRgb};--seal-s-rgb:${vars.dark.secondaryRgb};}`,
        }}
      />
      <AppSeal variant="b" />
      {children}
    </div>
  )
}

export function EditorHarness({
  mode,
  stories = false,
  tour = null,
  seal = false,
  sealBrand = '#1462DC',
}: {
  mode: 'edit' | 'create' | 'template'
  stories?: boolean
  /** `?tour=editor|hub`: stories de la Guía Viva en vez del editor (ver tour-stories.tsx). */
  tour?: TourId | null
  /** `?seal=1`: monta AppSeal `b` sobre la maqueta activa (gate S2.2 del Sello). */
  seal?: boolean
  /** Marca de prueba del sello (hex ya validado por la page; default EVA). */
  sealBrand?: string
}) {
  const isCreate = mode === 'create'
  const isTemplate = mode === 'template'
  // Identidad estable como en la page real (el server la manda una vez como prop).
  const creation = useMemo(() => (isCreate ? buildCreationInput() : null), [isCreate])
  const template = useMemo(() => (isTemplate ? buildTemplateInput() : null), [isTemplate])
  // Sin `?seal=1` el árbol queda BYTE-IDÉNTICO al de siempre (cero wrapper): las corridas
  // existentes del gate (edit/stories/tour) no ven diferencia alguna.
  const wrap = (node: React.ReactNode) => (seal ? <SealStage brand={sealBrand}>{node}</SealStage> : node)

  if (tour) {
    return wrap(
      <>
        <HarnessThemeToggle />
        <TourStories tourId={tour} />
      </>,
    )
  }

  if (stories) {
    return wrap(
      <>
        <HarnessThemeToggle />
        <MacroSparkStories />
      </>,
    )
  }

  return wrap(
    <>
      <HarnessThemeToggle />
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
          itemSubstitutions={isCreate || isTemplate ? [] : HARNESS_SUBSTITUTIONS}
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
    </>,
  )
}
