'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  FoodCatalogCursorSchema,
  FoodCatalogSearchReadModelSchema,
  NutritionPlanDraftSchema,
} from '@eva/nutrition-v2'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  NUTRITION_PRO_FEATURE_LABEL,
  hasNutritionProV2,
  requiredNutritionProFeature,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import type { BuilderFood } from '../_lib/draft-builder'
import { CoachFoodInputSchema, insertCoachFood } from '@/app/coach/nutrition-v2/_lib/coach-food'
import {
  authorizeCoach,
  fail,
  mapWriteError,
  persistAndPublishDraft,
  zodFields,
  type ActionFailure,
  type NutritionV2Db,
  type PublishSuccess,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'

// Builder V2 (web coach): publicacion de un plan de nutricion versionado.
// Fail-closed: cada acción re-verifica el scope V2 del workspace vía authorizeCoach. El draft se
// valida contra NutritionPlanDraftSchema.
// La persistencia + publicacion transaccional vive en `persistAndPublishDraft` (modulo
// compartido `_actions/plan-persistence.ts`), reusado por `assignPlanToClientsAction`.

const PublishInputSchema = z.object({
  draft: NutritionPlanDraftSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
  effectiveFrom: z.string().date(),
  /**
   * Compare-and-swap opcional (NUT-011): id de la version vigente que el wizard tenia en
   * pantalla al abrirse. Si otra sesion (otra pestaña, RN, quick-edit) publico entremedio, el
   * RPC responde `nutrition_v2_publish_stale_base` -> STALE_BASE en vez de superponer una
   * version calculada sobre datos viejos. Ausente (plan nuevo o rama "Reemplazar") => el RPC
   * omite el guard, comportamiento identico al anterior.
   */
  expectedCurrentVersionId: z.string().uuid().optional(),
})

const CatalogQuerySchema = z.object({
  query: z.string().trim().max(120),
  countryCode: z.string().trim().length(2).default('CL'),
  cursor: FoodCatalogCursorSchema.nullable().default(null),
})

const SearchInputSchema = CatalogQuerySchema.extend({
  clientId: z.string().uuid(),
})

type CatalogSearchOk = { ok: true; result: z.infer<typeof FoodCatalogSearchReadModelSchema> }

/**
 * Cuerpo compartido de la busqueda de catalogo: el RPC no toma alumno (el catalogo es del
 * pais + lo propio del coach), asi que las dos puertas —con alumno y sin alumno— corren
 * exactamente la misma consulta una vez pasado el gate.
 */
async function runCatalogSearch(
  db: NutritionV2Db,
  input: z.infer<typeof CatalogQuerySchema>,
): Promise<CatalogSearchOk | ActionFailure> {
  const search = await db.rpc('search_food_catalog_v2', {
    p_query: input.query,
    p_country_code: input.countryCode.toUpperCase(),
    p_cursor_score: input.cursor?.score ?? null,
    p_cursor_name: input.cursor?.name ?? null,
    p_cursor_id: input.cursor?.id ?? null,
    p_page_size: 25,
  })
  if (search.error) return mapWriteError(search.error, 'catalogo')

  const result = FoodCatalogSearchReadModelSchema.safeParse(search.data)
  if (!result.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catalogo devolvio un formato inesperado.')
  }
  return { ok: true, result: result.data }
}

/**
 * Publica un plan V2: valida el draft, aplica el gate comercial del addon Nutricion Pro y
 * delega la persistencia + publicacion transaccional en `persistAndPublishDraft`.
 *
 * Notas del plan: `visibleNotes` viaja en el draft (carry-over de la rehidratacion del wizard) y
 * `protocolNotes` se repone aca desde la version base, porque el wizard no lo edita.
 */
export async function publishPlanAction(input: unknown): Promise<PublishSuccess | ActionFailure> {
  const parsed = PublishInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'El plan tiene datos invalidos.', zodFields(parsed.error))
  }
  const { draft, idempotencyKey, effectiveFrom, expectedCurrentVersionId } = parsed.data

  const auth = await authorizeCoach(draft.clientId)
  if (!auth.ok) return auth
  const { db, userId } = auth

  // Gate comercial del addon Nutricion Pro (frontera CEO): strategy 'hybrid', mas de una
  // variante, o notas privadas/protocolo exigen el addon `nutrition_exchanges`. BASE publica
  // structured/flexible con UNA variante y sin notas privadas/protocolo, sin friccion. El
  // draft llega como `unknown`, asi que este assert server-side es la barrera real (la UI
  // solo espeja). Sin addon => error tipado UPGRADE_REQUIRED, nunca un 500.
  const proFeature = requiredNutritionProFeature(draft)
  if (proFeature) {
    const proEnabled = await hasNutritionProV2(db as unknown as SupabaseClient, auth.proCtx)
    if (!proEnabled) {
      return {
        ok: false,
        code: 'UPGRADE_REQUIRED',
        feature: proFeature,
        error: `Activa Nutricion Pro para publicar ${NUTRITION_PRO_FEATURE_LABEL[proFeature]}.`,
      }
    }
  }

  // Carry-over de `protocol_notes`: el wizard NO edita el protocolo profesional (no tiene campo),
  // asi que republicar desde "Rehacer con el asistente" lo BORRABA — la publicacion reescribe la
  // version completa y `assembleDraft` emite null. Se relee de la version base que el wizard tenia
  // en pantalla (la misma del compare-and-swap) y se repone DESPUES del gate Pro: el valor sale de
  // una version YA publicada, asi que reponerlo no introduce una capacidad Pro nueva
  // (grandfathering por construccion, como el delta-gate de la edicion rapida) y no es forjable
  // desde el cliente. Mismo patron que `quick-edit.actions.ts` y el endpoint del coach movil.
  // OJO: NO seleccionar `private_notes` (columna deprecada, sin grant de SELECT para
  // `authenticated`: pedirla tira 42501 sobre nutrition_plan_versions_v2).
  let draftToPersist = draft
  if (expectedCurrentVersionId && draft.planId) {
    const baseRes = await db
      .from('nutrition_plan_versions_v2')
      .select<{ id: string; plan_id: string; protocol_notes: string | null }>(
        'id, plan_id, protocol_notes',
      )
      .eq('id', expectedCurrentVersionId)
      .maybeSingle()
    // Fail-closed: si no podemos leer la version base tampoco podemos garantizar que la
    // publicacion no borre el protocolo, asi que no se publica a ciegas.
    if (baseRes.error) return mapWriteError(baseRes.error, 'notas')
    const base = baseRes.data
    // Anti-confusion de ids: la version base debe pertenecer al plan que el draft republica.
    if (base && base.plan_id === draft.planId && (base.protocol_notes ?? '').trim() !== '') {
      draftToPersist = { ...draft, protocolNotes: base.protocol_notes }
    }
  }

  const result = await persistAndPublishDraft({
    db,
    userId,
    draft: draftToPersist,
    idempotencyKey,
    effectiveFrom,
    // Solo cuando el wizard edita un plan existente (el CAS exige una version base real).
    ...(expectedCurrentVersionId ? { expectedCurrentVersionId } : {}),
  })
  if (!result.ok) return result

  revalidatePath('/coach/nutrition-v2')
  revalidatePath('/coach/nutrition-v2/' + draft.clientId)
  return result
}

/**
 * Busqueda en el catalogo local (Chile) via search_food_catalog_v2 para el builder.
 * Solo lectura; re-verifica el gate webCoach y devuelve el read model validado.
 */
export async function searchFoodCatalogCoachAction(
  input: unknown,
): Promise<CatalogSearchOk | ActionFailure> {
  const parsed = SearchInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Busqueda invalida.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(parsed.data.clientId, 'catalog-search')
  if (!auth.ok) return auth

  return runCatalogSearch(auth.db, parsed.data)
}

/**
 * Misma busqueda de catalogo, SIN alumno: la usa el builder de PLANTILLAS, donde el coach arma
 * material generico y no hay ficha que autorizar. El gate es identico (sesion + rate limit de
 * catalogo + workspace con scope V2); lo unico que desaparece es un `clientId` que el RPC nunca
 * miro. Se expone como accion propia en vez de volver el campo opcional para que la puerta sin
 * alumno sea explicita y auditable, en vez de un `undefined` que se cuela.
 */
export async function searchFoodCatalogForCoachAction(
  input: unknown,
): Promise<CatalogSearchOk | ActionFailure> {
  const parsed = CatalogQuerySchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Busqueda invalida.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(null, 'catalog-search')
  if (!auth.ok) return auth

  return runCatalogSearch(auth.db, parsed.data)
}

/**
 * Crea un alimento coach-scoped desde el "alimento libre con macros" del builder.
 * Fail-closed: re-verifica el gate/scope via authorizeCoach. El INSERT vive en
 * `_lib/coach-food.ts` (`insertCoachFood`) y lo comparte con el endpoint de mutaciones del coach
 * movil (`POST /api/mobile/nutrition-v2/coach/mutate`, accion `createFood`): una sola
 * implementacion de la escritura para web y RN, con macros POR 100 (serving_size = 100),
 * catalog_source='coach' y verification_status='coach_verified'.
 */
export async function createCoachFoodAction(
  input: unknown,
): Promise<{ ok: true; food: BuilderFood } | ActionFailure> {
  const parsed = CoachFoodInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.', zodFields(parsed.error))
  }
  const { clientId } = parsed.data

  const auth = await authorizeCoach(clientId)
  if (!auth.ok) return auth

  const created = await insertCoachFood({ db: auth.db, userId: auth.userId, input: parsed.data })
  if (!created.ok) return created

  revalidatePath('/coach/nutrition-v2/' + clientId)
  return created
}
