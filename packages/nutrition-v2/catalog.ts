import { z } from 'zod'
import { NutritionMacrosBasisSchema } from './contracts'

/** Macros del catálogo ANTES del override del coach (badge ✎ con el valor tachado, T2.2). */
export const FoodOriginalMacrosSchema = z.object({
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatsG: z.number().nonnegative(),
  fiberG: z.number().nonnegative().nullable(),
})

export const FoodVerificationStatusSchema = z.enum([
  'unverified',
  'community',
  'coach_verified',
  'eva_verified',
  'rejected',
])

export const FoodMediaKindSchema = z.enum([
  'product_photo',
  'eva_illustration',
  'category_fallback',
])

export const FoodMediaLicenseSchema = z.enum([
  'eva_owned',
  'supplier_authorized',
  'public_domain',
  'cc_by',
  'cc_by_sa',
  'unknown',
])

export const FoodMediaReadSchema = z.object({
  id: z.string().uuid(),
  kind: FoodMediaKindSchema,
  bucket: z.string(),
  objectPath: z.string(),
  version: z.number().int().positive(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  mimeType: z.string().nullable(),
  blurhash: z.string().nullable(),
  license: FoodMediaLicenseSchema,
  sourceUrl: z.string().url().nullable(),
  attribution: z.string().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
})

export const FoodCatalogItemSchema = z.object({
  id: z.string().uuid(),
  catalogKey: z.string().nullable(),
  gtin: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  category: z.string().nullable(),
  countryCode: z.string().nullable(),
  servingSize: z.number().positive(),
  servingUnit: z.string(),
  calories: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatsG: z.number().nonnegative(),
  fiberG: z.number().nonnegative().nullable(),
  sodiumMg: z.number().nonnegative().nullable(),
  sugarG: z.number().nonnegative().nullable(),
  saturatedFatG: z.number().nonnegative().nullable(),
  packageQuantity: z.number().positive().nullable(),
  packageUnit: z.string().nullable(),
  source: z.string(),
  sourceRef: z.string().nullable(),
  verificationStatus: FoodVerificationStatusSchema,
  /**
   * Dueño del alimento en el catálogo (`foods.coach_id` / `foods.org_id`). Lo expone
   * `private.food_catalog_v2_item_json` desde 20260805213958 para que el picker agrupe
   * "Mis alimentos" vs "Catálogo" sin heurísticas sobre `source`.
   *
   * OPCIONALES a propósito (compat RN): una build móvil vieja puede tener cacheado un item
   * emitido antes de esa migración, y el contrato no debe romperse por una clave nueva.
   * `null` = alimento global (catálogo EVA/importado), no "desconocido".
   */
  coachId: z.string().uuid().nullable().optional(),
  orgId: z.string().uuid().nullable().optional(),
  /**
   * Base declarada de los macros de arriba (NUT-001). Hasta T2.1 el JSON no la emitía y todo
   * consumidor asumía `per_100` (`CATALOG_MACROS_BASIS`) — mentira latente para las filas
   * `per_serving` del seed de intercambios. Ahora viaja siempre desde
   * `private.food_catalog_v2_item_json`.
   *
   * `.nullable().optional()` por la MISMA razón que `coachId`: una build RN vieja puede tener
   * cacheado un item emitido antes de la migración. Ausente = no declarada ⇒ el consumidor
   * aplica su regla histórica; nunca se inventa la base.
   */
  macrosBasis: NutritionMacrosBasisSchema.nullable().optional(),
  /**
   * Medida casera del alimento (override del coach o la del catálogo). Viajan como PAR:
   * una etiqueta sin gramos no convierte nada y unos gramos sin etiqueta no se muestran.
   */
  householdLabel: z.string().nullable().optional(),
  householdGrams: z.number().positive().nullable().optional(),
  /**
   * Overrides de macros del coach (specs/nutrition-food-overrides). `hasOverride` marca la
   * fila para el badge ✎ y `original` conserva los macros del catálogo para mostrarlos
   * tachados. Ausentes = el catálogo no aplicó merge (RPC vieja o actor sin coach).
   */
  hasOverride: z.boolean().nullable().optional(),
  original: FoodOriginalMacrosSchema.nullable().optional(),
  media: FoodMediaReadSchema.nullable(),
})

/**
 * Item de la respuesta de sugerencias. Es el MISMO item del catálogo; `usageCount` solo
 * viaja en `coachTop` (cuántas veces el coach prescribió ese alimento).
 */
export const FoodSuggestionItemSchema = FoodCatalogItemSchema.extend({
  usageCount: z.number().int().nonnegative().optional(),
})

/**
 * Sugerencias pre-búsqueda del picker de alimentos V2 (`get_coach_food_suggestions_v2`).
 * `clientRecent` y `clientFavorites` llegan vacías cuando no hay alumno en contexto o el
 * coach no puede leerlo (la RPC ya aplica ese corte server-side).
 */
export const CoachFoodSuggestionsReadModelSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  coachTop: z.array(FoodSuggestionItemSchema),
  clientRecent: z.array(FoodCatalogItemSchema),
  clientFavorites: z.array(FoodCatalogItemSchema),
})

export const FoodCatalogCursorSchema = z.object({
  score: z.number().finite(),
  name: z.string(),
  id: z.string().uuid(),
})

export const FoodCatalogSearchReadModelSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  query: z.string(),
  countryCode: z.string().nullable(),
  items: z.array(FoodCatalogItemSchema),
  nextCursor: FoodCatalogCursorSchema.nullable(),
  hasMore: z.boolean(),
})

/**
 * Pagina por OFFSET del tab Alimentos del coach: el browse del catalogo, "Solo mios" y "Editados
 * por mi" (T2.3 F4.5/F1, y F6.1 para el movil). Es la forma COMUN de los tres: el cliente no
 * necesita saber cual respondio — pide `nextOffset` y lo devuelve tal cual en "Cargar mas", asi
 * que el tamaño de pagina lo decide el servidor y puede diferir por modo.
 *
 * Sin `schemaVersion` a proposito: no lo emite una RPC versionada sino la propia API movil, que
 * versiona por ruta. `nextOffset` es null exactamente cuando `hasMore` es false.
 */
export const FoodCatalogOffsetPageSchema = z.object({
  items: z.array(FoodCatalogItemSchema),
  hasMore: z.boolean(),
  nextOffset: z.number().int().nonnegative().nullable(),
})

export const FoodBarcodeLookupReadModelSchema = z.discriminatedUnion('status', [
  z.object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    status: z.literal('found'),
    gtin: z.string(),
    food: FoodCatalogItemSchema,
  }),
  z.object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    status: z.literal('invalid'),
    gtin: z.string(),
  }),
  z.object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    status: z.literal('not_found'),
    gtin: z.string(),
    missingReportId: z.string().uuid().nullable(),
  }),
  z.object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime({ offset: true }),
    status: z.literal('pending_verification'),
    gtin: z.string(),
    food: FoodCatalogItemSchema,
  }),
])

export const MissingFoodBarcodeReportSchema = z.object({
  clientId: z.string().uuid().nullable().default(null),
  gtin: z.string().regex(/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/),
  countryCode: z.string().length(2).default('CL'),
  capturedName: z.string().trim().max(180).nullable().default(null),
  capturedBrand: z.string().trim().max(180).nullable().default(null),
  packagePhotoPath: z.string().trim().max(500).nullable().default(null),
  source: z.enum(['pwa_scanner', 'rn_scanner', 'manual']).default('manual'),
  idempotencyKey: z.string().trim().min(8).max(200),
})

export const FoodCatalogImportRowSchema = z.object({
  batchId: z.string().uuid(),
  sourceRow: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown()),
  normalizedGtin: z.string().nullable(),
  normalizedCatalogKey: z.string().nullable(),
  status: z.enum(['pending', 'accepted', 'rejected', 'duplicate']),
  rejectionReason: z.string().nullable(),
})

export type FoodOriginalMacros = z.infer<typeof FoodOriginalMacrosSchema>
export type FoodVerificationStatus = z.infer<typeof FoodVerificationStatusSchema>
export type FoodMediaRead = z.infer<typeof FoodMediaReadSchema>
export type FoodCatalogItem = z.infer<typeof FoodCatalogItemSchema>
export type FoodSuggestionItem = z.infer<typeof FoodSuggestionItemSchema>
export type CoachFoodSuggestionsReadModel = z.infer<typeof CoachFoodSuggestionsReadModelSchema>
export type FoodCatalogCursor = z.infer<typeof FoodCatalogCursorSchema>
export type FoodCatalogSearchReadModel = z.infer<typeof FoodCatalogSearchReadModelSchema>
export type FoodCatalogOffsetPage = z.infer<typeof FoodCatalogOffsetPageSchema>
export type FoodBarcodeLookupReadModel = z.infer<typeof FoodBarcodeLookupReadModelSchema>
export type MissingFoodBarcodeReport = z.infer<typeof MissingFoodBarcodeReportSchema>
