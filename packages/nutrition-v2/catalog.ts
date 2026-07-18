import { z } from 'zod'

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
  media: FoodMediaReadSchema.nullable(),
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

export type FoodVerificationStatus = z.infer<typeof FoodVerificationStatusSchema>
export type FoodMediaRead = z.infer<typeof FoodMediaReadSchema>
export type FoodCatalogItem = z.infer<typeof FoodCatalogItemSchema>
export type FoodCatalogCursor = z.infer<typeof FoodCatalogCursorSchema>
export type FoodCatalogSearchReadModel = z.infer<typeof FoodCatalogSearchReadModelSchema>
export type FoodBarcodeLookupReadModel = z.infer<typeof FoodBarcodeLookupReadModelSchema>
export type MissingFoodBarcodeReport = z.infer<typeof MissingFoodBarcodeReportSchema>
