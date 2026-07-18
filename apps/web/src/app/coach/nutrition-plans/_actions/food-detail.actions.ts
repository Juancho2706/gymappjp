'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { FoodDetailData } from '@/lib/food-detail'

/**
 * Ficha de alimento del hub V1 del coach: trae las columnas extendidas del catálogo
 * (`foods`) que la lista compacta NO carga (barcode, envase, fuente, verificación,
 * micros). Solo lectura.
 *
 * - RLS es la puerta real: `foods` limita al coach a los alimentos del sistema, los
 *   propios y los de su org. Un `.eq('id', foodId)` fuera de ese alcance devuelve null.
 * - Fail-closed: sin sesión autenticada devolvemos null (no filtramos filas).
 * - Zod v4 valida/normaliza la fila (numéricos coercidos, snake→camel) antes de la UI.
 *
 * Las columnas extendidas (barcode, catalog_source, verification_status, package_*)
 * son aditivas y aún no están en database.types.ts, así que la query usa un cliente
 * con tipado acotado (mismo patrón que los RPC de intake V2).
 */

const FoodDetailRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    brand: z.string().nullable().default(null),
    category: z.string().nullable().default(null),
    calories: z.coerce.number().default(0),
    protein_g: z.coerce.number().default(0),
    carbs_g: z.coerce.number().default(0),
    fats_g: z.coerce.number().default(0),
    fiber_g: z.coerce.number().nullable().default(null),
    sodium_mg: z.coerce.number().nullable().default(null),
    sugar_g: z.coerce.number().nullable().default(null),
    saturated_fat_g: z.coerce.number().nullable().default(null),
    is_liquid: z.boolean().default(false),
    serving_size: z.coerce.number().default(100),
    serving_unit: z.string().nullable().default(null),
    household_grams: z.coerce.number().nullable().default(null),
    household_label: z.string().nullable().default(null),
    package_quantity: z.coerce.number().nullable().default(null),
    package_unit: z.string().nullable().default(null),
    barcode: z.string().nullable().default(null),
    country_code: z.string().nullable().default(null),
    catalog_source: z.string().default('eva'),
    verification_status: z.string().default('unverified'),
    product_image_path: z.string().nullable().default(null),
    // Recurso embebido (PostgREST) — puede llegar null si la fila no tiene media.
    food_media: z
      .array(
        z.object({
          object_path: z.string(),
          source_url: z.string().nullable().default(null),
          is_primary: z.boolean().default(false),
          kind: z.string().default('product_photo'),
        }),
      )
      .nullable()
      .default(null),
  })
  .transform((r): FoodDetailData => {
    const media = Array.isArray(r.food_media) ? r.food_media : []
    const primaryPhoto =
      media.find((m) => m.is_primary) ??
      media.find((m) => m.kind === 'product_photo') ??
      media[0] ??
      null
    return ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      category: r.category,
      calories: r.calories,
      proteinG: r.protein_g,
      carbsG: r.carbs_g,
      fatsG: r.fats_g,
      fiberG: r.fiber_g,
      sodiumMg: r.sodium_mg,
      sugarG: r.sugar_g,
      saturatedFatG: r.saturated_fat_g,
      isLiquid: r.is_liquid,
      servingSize: r.serving_size,
      servingUnit: r.serving_unit,
      householdGrams: r.household_grams,
      householdLabel: r.household_label,
      packageQuantity: r.package_quantity,
      packageUnit: r.package_unit,
      barcode: r.barcode,
      countryCode: r.country_code,
      source: r.catalog_source,
      verificationStatus: r.verification_status,
      imagePath: primaryPhoto?.object_path ?? r.product_image_path,
      imageSourceUrl: primaryPhoto?.source_url ?? null,
    })
  })

const FOOD_DETAIL_COLUMNS =
  'id, name, brand, category, calories, protein_g, carbs_g, fats_g, fiber_g, sodium_mg, sugar_g, saturated_fat_g, is_liquid, serving_size, serving_unit, household_grams, household_label, package_quantity, package_unit, barcode, country_code, catalog_source, verification_status, product_image_path'

// Igual que la base pero embebe la media curada (foto + source_url para "Ver original").
// El embed puede fallar en entornos donde la relación PostgREST no exista: en ese
// caso la query cae a FOOD_DETAIL_COLUMNS (mismo schema tolerante) sin regresión.
const FOOD_DETAIL_COLUMNS_WITH_MEDIA =
  FOOD_DETAIL_COLUMNS + ', food_media(object_path, source_url, is_primary, kind)'

type FoodDetailQueryClient = {
  from: (table: 'foods') => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
      }
    }
  }
}

const FoodIdSchema = z.string().uuid()

export async function getCoachFoodDetail(foodId: string): Promise<FoodDetailData | null> {
  const parsedId = FoodIdSchema.safeParse(foodId)
  if (!parsedId.success) return null

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const client = supabase as unknown as FoodDetailQueryClient
  let { data, error } = await client
    .from('foods')
    .select(FOOD_DETAIL_COLUMNS_WITH_MEDIA)
    .eq('id', parsedId.data)
    .maybeSingle()
  if (error) {
    // Fallback sin embed (p. ej. relación PostgREST ausente) — nunca rompe la ficha.
    ;({ data, error } = await client
      .from('foods')
      .select(FOOD_DETAIL_COLUMNS)
      .eq('id', parsedId.data)
      .maybeSingle())
  }
  if (error || !data) return null

  const parsed = FoodDetailRowSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}
