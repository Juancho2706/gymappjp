/**
 * nutrition-v2-scanner.logic — lógica PURA del scanner de código de barras del alumno
 * (sin react-native / expo / red). Espejo 1:1 de los helpers web del scanner — NO driftar:
 *
 *  - `missingFoodReportKey` ⇐ apps/web/src/components/nutrition-v2/missing-food-report-key.ts
 *    (canon con test en `missing-food-report-key.test.ts` web; esta copia debe mantenerse idéntica).
 *  - `ScannerRegistrationContext` + `registrationContextFromToday`
 *    ⇐ apps/web/src/components/nutrition-v2/scanned-food-intake.logic.ts:10-20 +
 *    apps/web/src/app/c/[coach_slug]/nutrition-v2/scanner/page.tsx:38-47 (RN omite
 *    `revalidatePath`: en mobile no hay revalidate de RSC; el retorno al Hoy es navegación).
 *  - `scannedFoodUnitOptions` ⇐ FoodScannerClient.tsx:389-391 (mismas opciones de unidad que
 *    el diálogo de búsqueda del Today).
 *  - `buildScannedFoodIntakeMutation` ⇐ scanned-food-intake.logic.ts:30-46
 *    (`buildScannedFoodIntakePayload`): payload de alimento libre del catálogo — source
 *    'offplan', snapshot POR PORCIÓN del food (el RPC escala con quantity) — con un solo
 *    cambio honesto: captureMethod 'barcode'. En RN la idempotency-key no viene inyectada:
 *    se deriva estable de clientId+deviceId+operationId (mecanismo existente de la cola
 *    offline, `nutrition-v2-intake.ts`), para que reintento/encolado dedupliquen extremo a
 *    extremo. 'pending_verification' NO bloquea: es curación del catálogo, no un permiso.
 */
import type {
  FoodCatalogItem,
  NutritionIntakeMutation,
  NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { buildRecordIntakeMutation } from './nutrition-v2-intake'

/**
 * Clave de idempotencia ESTABLE para el reporte de un GTIN faltante desde el scanner.
 *
 * El RPC `report_missing_food_gtin_v2` deduplica por `p_idempotency_key`. La versión anterior
 * generaba la clave con `Date.now()`, así que cada reintento (mismo alumno, mismo código, mismo
 * día) producía una clave distinta y creaba un reporte duplicado — la deduplicación nunca aplicaba.
 *
 * Esta clave es determinista por CONTENIDO: mismo alumno + mismo GTIN + mismo día local ⇒ misma
 * clave. Así el reintento del alumno reusa el reporte del día en vez de duplicarlo. El GTIN se
 * normaliza a dígitos (coincide con la normalización del lookup). Sin dependencias nuevas: la
 * fecha local sale del reloj del dispositivo (igual que la web).
 */
export function missingFoodReportKey(input: {
  clientId: string
  gtin: string
  /** Inyectable para tests deterministas; por defecto el momento actual (fecha LOCAL). */
  now?: Date
}): string {
  const gtin = input.gtin.replace(/\D/g, '')
  const localDate = toLocalIsoDate(input.now ?? new Date())
  return `missing:${input.clientId}:${gtin}:${localDate}`
}

/** Fecha LOCAL en formato YYYY-MM-DD (no UTC): un reporte por día calendario del alumno. */
function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Contexto mínimo para poder REGISTRAR el alimento escaneado por el mismo camino que el
 * registro por búsqueda. Sin este contexto el scanner es solo-consulta (no muestra el CTA
 * "Registrar") — misma degradación que la web (`FoodScannerClient` sin `registration`).
 */
export interface ScannerRegistrationContext {
  /** Día local del alumno (America/Santiago), igual al del read model de Hoy. */
  localDate: string
  timezone: string
  planVersionId: string | null
  snapshotId: string | null
  /** Franjas del día como opciones {code,label} (mismas del diálogo de búsqueda). */
  slotOptions: Array<{ code: string; label: string }>
}

/** Reduce el read model de Hoy al contexto del scanner (espejo de scanner/page.tsx:40-47). */
export function registrationContextFromToday(
  today: NutritionTodayReadModel,
): ScannerRegistrationContext {
  return {
    localDate: today.localDate,
    timezone: today.timezone,
    planVersionId: today.plan?.versionId ?? null,
    snapshotId: today.snapshotId,
    slotOptions: today.mealSlots.map((slot) => ({ code: slot.code, label: slot.name })),
  }
}

/** Opciones de unidad del diálogo de registro (espejo FoodScannerClient.tsx:389-391). */
export function scannedFoodUnitOptions(food: Pick<FoodCatalogItem, 'servingUnit'>): string[] {
  return Array.from(new Set([food.servingUnit, 'g', 'ml', 'porción', 'unidad']))
}

/**
 * Payload de intake para un alimento ESCANEADO (espejo de `buildScannedFoodIntakePayload`
 * web): alimento libre del catálogo con captureMethod 'barcode'. Valida con Zod vía
 * `buildRecordIntakeMutation` y deriva la idempotency-key estable del trío
 * clientId+deviceId+operationId (cola offline existente).
 */
export function buildScannedFoodIntakeMutation(input: {
  clientId: string
  deviceId: string
  operationId: string
  occurredAt: string
  registration: ScannerRegistrationContext
  food: FoodCatalogItem
  quantity: number
  unit: string
  mealSlotCode: string | null
}): NutritionIntakeMutation {
  const { food, registration } = input
  return buildRecordIntakeMutation({
    clientId: input.clientId,
    deviceId: input.deviceId,
    operationId: input.operationId,
    localDate: registration.localDate,
    occurredAt: input.occurredAt,
    timezone: registration.timezone,
    foodId: food.id,
    quantity: input.quantity,
    unit: input.unit,
    mealSlot: input.mealSlotCode,
    source: 'offplan',
    captureMethod: 'barcode',
    planVersionId: registration.planVersionId,
    daySnapshotId: registration.snapshotId,
    snapshot: {
      name: food.name,
      brand: food.brand,
      calories: food.calories,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatsG: food.fatsG,
      fiberG: food.fiberG,
      servingSize: food.servingSize,
      servingUnit: food.servingUnit,
    },
  })
}
