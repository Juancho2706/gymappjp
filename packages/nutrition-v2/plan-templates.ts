import { z } from 'zod'
import { NutritionPlanDraftSchema, type NutritionPlanDraft } from './contracts'

/**
 * Plantillas de plan V2 (F3 — specs/nutrition-plan-templates-v2).
 *
 * Todo lo de este archivo es PURO: lo consumen las server actions web, la API movil y el
 * importador de las 33 plantillas V1. Ninguna superficie debe tener su propia idea de que es
 * una plantilla.
 *
 * AD-2: la plantilla NO es un plan. Guarda el DRAFT que el builder ya sabe producir y
 * rehidratar, **sin identidad**: sin planId/versionId/clientId y sin los ids de variantes,
 * franjas, items y targets. Un draft que conserve esos ids haria que el builder intentara
 * ACTUALIZAR filas de otro plan al persistir — el bug mas caro posible en esta feature.
 */

/** Version del contrato guardado. Sube cuando el draft cambia de forma de manera incompatible. */
export const TEMPLATE_SCHEMA_VERSION = 1

/** Tope de plantillas vivas por coach. Una biblioteca infinita deja de ser navegable. */
export const MAX_PLAN_TEMPLATES_PER_COACH = 100

/**
 * El draft tal como se guarda: el del builder menos la identidad y menos la fecha de entrada en
 * vigor (una plantilla no tiene `effectiveFrom`; lo elige el coach al aplicarla).
 */
export const NutritionPlanTemplateDraftSchema = NutritionPlanDraftSchema.omit({
  planId: true,
  versionId: true,
  clientId: true,
  effectiveFrom: true,
})
export type NutritionPlanTemplateDraft = z.infer<typeof NutritionPlanTemplateDraftSchema>

export type NutritionPlanTemplateSummary = {
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatsG: number | null
  dayVariantCount: number
  mealSlotCount: number
  itemCount: number
  /** true ⇒ el plan usa porciones a elección en alguna franja. */
  hasPortions: boolean
}

type WithOptionalId = { id?: unknown }

function withoutId<T extends WithOptionalId>(node: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = node
  return rest
}

/**
 * Quita TODA la identidad del draft: la del plan y la de cada fila hija. Devuelve el objeto que
 * se guarda en `nutrition_plan_templates_v2.draft`.
 *
 * Se hace por construccion explicita y no con un borrado recursivo generico: un `delete` ciego
 * sobre cualquier llave `id` tambien se llevaria `exchangeGroupId`, `foodId` o `recipeId`, que
 * SI tienen que viajar (apuntan al catalogo, no a filas del plan).
 */
export function stripDraftIdentity(
  draft: NutritionPlanDraft | NutritionPlanTemplateDraft
): NutritionPlanTemplateDraft {
  const source = draft as NutritionPlanDraft
  return {
    name: source.name,
    strategy: source.strategy,
    timezone: source.timezone,
    permissions: source.permissions,
    visibleNotes: source.visibleNotes ?? null,
    privateNotes: source.privateNotes ?? null,
    protocolNotes: source.protocolNotes ?? null,
    dayVariants: (source.dayVariants ?? []).map((variant) => ({
      ...withoutId(variant),
      mealSlots: (variant.mealSlots ?? []).map((slot) => ({
        ...withoutId(slot),
        items: (slot.items ?? []).map((item) => withoutId(item)),
        exchangeTargets: slot.exchangeTargets?.map((target) => withoutId(target)),
      })),
    })),
  } as NutritionPlanTemplateDraft
}

/**
 * Rehidrata la plantilla para un alumno concreto. El `clientId` viene del caller (URL del
 * builder, ya autorizada), jamas del JSON guardado.
 *
 * `effectiveFrom` queda en `null` a proposito: la fecha la decide el coach en el builder, y
 * heredar la de otro plan es la clase de detalle silencioso que publica un plan con fecha vieja.
 */
export function hydrateTemplateDraft(
  template: NutritionPlanTemplateDraft,
  target: { clientId: string; name?: string | null }
): NutritionPlanDraft {
  const name = (target.name ?? '').trim() || template.name
  return {
    ...template,
    name,
    clientId: target.clientId,
    effectiveFrom: null,
  } as NutritionPlanDraft
}

function pickTargets(draft: NutritionPlanTemplateDraft) {
  const base = draft.dayVariants.find((variant) => variant.default) ?? draft.dayVariants[0]
  return base?.targets ?? null
}

/**
 * Resumen que ve el coach en la biblioteca. Se guarda calculado en la fila para no parsear
 * decenas de drafts en cada render del Centro V2.
 */
export function summarizeTemplateDraft(draft: NutritionPlanTemplateDraft): NutritionPlanTemplateSummary {
  const targets = pickTargets(draft) as Record<string, number | null | undefined> | null
  let mealSlotCount = 0
  let itemCount = 0
  let hasPortions = false
  for (const variant of draft.dayVariants ?? []) {
    for (const slot of variant.mealSlots ?? []) {
      mealSlotCount += 1
      itemCount += slot.items?.length ?? 0
      if ((slot.exchangeTargets?.length ?? 0) > 0) hasPortions = true
    }
  }
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null
  return {
    calories: num(targets?.calories),
    proteinG: num(targets?.proteinG),
    carbsG: num(targets?.carbsG),
    fatsG: num(targets?.fatsG),
    dayVariantCount: draft.dayVariants?.length ?? 0,
    mealSlotCount,
    itemCount,
    hasPortions,
  }
}

/**
 * Lo que se guarda REALMENTE en la columna `draft` de `nutrition_plan_templates_v2`.
 *
 * Por que un envoltorio y no el draft pelado: el contrato de item
 * (`NutritionPrescriptionItemSchema`) NO lleva macros, asi que un item LIBRE (sin `foodId`)
 * perderia sus macros al serializarse. El campo `builder` guarda ademas el estado exacto del
 * wizard web — que si las lleva, junto con el snapshot del alimento — para que "reutilizar"
 * devuelva el plan IDENTICO a como se guardo.
 *
 *  · `draft`   canonico y compartible: lo entiende RN y lo produce el importador de las V1.
 *  · `builder` opcional: presente cuando la plantilla nace del wizard web. Las plantillas
 *              importadas de V1 no lo traen (sus items siempre tienen `foodId`, asi que el
 *              adaptador las reconstruye sin perder nada).
 *
 * `builder` viaja como `unknown` a proposito: su forma pertenece al wizard web y este paquete
 * lo consume tambien RN, que no debe conocerla ni arrastrarla.
 */
export const NutritionPlanTemplatePayloadSchema = z.object({
  schemaVersion: z.number().int().positive(),
  draft: NutritionPlanTemplateDraftSchema,
  builder: z.unknown().optional(),
})
export type NutritionPlanTemplatePayload = z.infer<typeof NutritionPlanTemplatePayloadSchema>

/**
 * Lee el envoltorio guardado. Devuelve `null` en vez de lanzar: la columna es JSON
 * client-controlled y una plantilla vieja o corrupta debe degradar a "no se puede abrir",
 * nunca reventar el Centro V2 entero.
 */
export function parseTemplatePayload(raw: unknown): NutritionPlanTemplatePayload | null {
  const parsed = NutritionPlanTemplatePayloadSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function buildTemplatePayload(input: {
  draft: NutritionPlanDraft | NutritionPlanTemplateDraft
  builder?: unknown
}): NutritionPlanTemplatePayload {
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    draft: stripDraftIdentity(input.draft),
    ...(input.builder === undefined ? {} : { builder: input.builder }),
  }
}

/**
 * `?from=template:<templateId>` / `?from=plan:<clientId>` — la UNICA puerta al builder con
 * origen (AD-3). Parsear acá (y no en cada pantalla) evita que el modal y los enlaces profundos
 * diverjan.
 *
 * En `plan:` el id es el del ALUMNO fuente, no el del plan: lo que se copia es su plan VIGENTE,
 * que es lo único que el read-model scoped sirve y lo único que el coach elige en el selector.
 */
export type PlanBuilderOrigin =
  | { kind: 'template'; id: string }
  | { kind: 'plan'; id: string }
  | null

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parsePlanBuilderOrigin(raw: string | null | undefined): PlanBuilderOrigin {
  if (!raw) return null
  const [kind, id] = raw.split(':')
  if (!id || !UUID_RE.test(id)) return null
  if (kind === 'template') return { kind: 'template', id }
  if (kind === 'plan') return { kind: 'plan', id }
  return null
}

export function formatPlanBuilderOrigin(origin: Exclude<PlanBuilderOrigin, null>): string {
  return `${origin.kind}:${origin.id}`
}

/** Forma minima que necesita `collectTemplateFoodIds` (draft de plantilla o de plan). */
interface TemplateDraftLike {
  dayVariants?: Array<{
    mealSlots?: Array<{ items?: Array<{ foodId?: string | null }> }>
  }>
}

/**
 * Ids de alimentos referenciados por un draft (dedupe), para resolverlos server-side antes de
 * hidratar. Vivia en el `rehydrate` del wizard web; lo usan el editor de planes, el de
 * plantillas y el endpoint movil de plantillas, asi que su casa es el paquete.
 */
export function collectTemplateFoodIds(draft: TemplateDraftLike): string[] {
  const ids = new Set<string>()
  for (const variant of draft.dayVariants ?? []) {
    for (const slot of variant.mealSlots ?? []) {
      for (const item of slot.items ?? []) {
        if (item.foodId) ids.add(item.foodId)
      }
    }
  }
  return [...ids]
}
