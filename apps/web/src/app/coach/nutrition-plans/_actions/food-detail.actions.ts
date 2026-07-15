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
  })
  .transform(
    (r): FoodDetailData => ({
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
    }),
  )

const FOOD_DETAIL_COLUMNS =
  'id, name, brand, category, calories, protein_g, carbs_g, fats_g, fiber_g, sodium_mg, sugar_g, saturated_fat_g, is_liquid, serving_size, serving_unit, household_grams, household_label, package_quantity, package_unit, barcode, country_code, catalog_source, verification_status'

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
  const { data, error } = await client
    .from('foods')
    .select(FOOD_DETAIL_COLUMNS)
    .eq('id', parsedId.data)
    .maybeSingle()
  if (error || !data) return null

  const parsed = FoodDetailRowSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}
