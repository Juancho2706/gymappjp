/**
 * plan-substitutions — los reemplazos autorizados por el coach, LEGIBLES en la tarjeta del plan
 * del alumno (SUB-T10). Modulo puro: sin React, sin red, sin IO.
 *
 * Por que existe: hasta ahora la tarjeta del plan solo pintaba `item.notes`, o sea el texto
 * LEGADO "Alternativas: Pavo, Atun" que la conversion V1->V2 congelo. Los reemplazos
 * ESTRUCTURADOS (`nutrition_item_substitutions_v2`, F-02) que el coach carga desde el builder no
 * se veian en ninguna parte del plan: el alumno solo se enteraba de ellos en el tab "Hoy", y solo
 * el mismo dia. Esta funcion es la unica gramatica de ese renglon, compartida por web y RN.
 *
 * Que NO hace, a proposito: **no calcula equivalencias caloricas**. Las filas del plan traen los
 * `snapshot_*` congelados del reemplazo, que corresponden a UNA PORCION DEL SUSTITUTO y no a lo
 * prescrito (ver `substitution-intake.ts`: el item "Lomo liso 120 g / 240 kcal" ofrece "Posta de
 * vacuno cocida / 17 kcal"). Pintar ese numero seria mentir con precision. La equivalencia vive
 * donde se registra —el sheet del "Hoy", que lee macros VIGENTES por RPC— y aca solo se dice el
 * nombre y, si el coach la escribio, SU cantidad.
 */
import { formatNutritionAmount } from './design'

/** Prefijo del texto legado "Alternativas: ..." que la conversion V1->V2 congelo en `notes`. */
export const LEGACY_ALTERNATIVES_NOTE_PREFIX = 'Alternativas:'

/** Separador entre opciones. Mismo que usa `describeItemGuidance` para su cadena de guia. */
export const PLAN_SUBSTITUTION_SEPARATOR = ' · '

/**
 * Forma minima de un reemplazo (espejo estructural de `NutritionItemSubstitutionRead`, sin
 * arrastrar el read-model entero): nombre ya resuelto + la cantidad que el coach escribio, que en
 * LIVE es NULL en el 100% de las filas.
 */
export interface PlanItemSubstitutionLike {
  name: string
  quantity: number | null
  unit: string | null
}

/** Item prescrito con su capa OPCIONAL de reemplazos. Sin ella el item queda identico a hoy. */
export interface PlanItemWithSubstitutions {
  substitutions?: readonly PlanItemSubstitutionLike[] | null
}

/**
 * Una opcion: "120 g de Pollo" cuando el coach fijo la cantidad, o solo "Pollo" cuando no.
 *
 * Los decimales se deciden por el valor y no por la unidad: `formatNutritionAmount` redondea a
 * entero por defecto y media unidad contada (0,5) se convertiria en "1".
 */
function describeSubstitutionOption(sub: PlanItemSubstitutionLike): string | null {
  const name = sub.name?.trim() ?? ''
  if (name.length === 0) return null
  const quantity = sub.quantity
  const unit = sub.unit?.trim() ?? ''
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0 || unit.length === 0) {
    return name
  }
  const amount = formatNutritionAmount(quantity, unit, Number.isInteger(quantity) ? 0 : 2)
  return `${amount} de ${name}`
}

/**
 * Renglon de reemplazos de un item prescrito: "o 120 g de Pollo · o Huevo".
 *
 * Devuelve `null` cuando el item no tiene reemplazos utilizables — que es el caso de casi todo el
 * catalogo vivo—, asi que la UI no pinta nada y la tarjeta queda byte-identica a hoy.
 */
export function describeItemSubstitutions(item: PlanItemWithSubstitutions): string | null {
  const subs = item.substitutions ?? []
  const parts: string[] = []
  for (const sub of subs) {
    const label = describeSubstitutionOption(sub)
    if (label !== null) parts.push(`o ${label}`)
  }
  return parts.length > 0 ? parts.join(PLAN_SUBSTITUTION_SEPARATOR) : null
}

/**
 * Nota a mostrar bajo un item prescrito. Cuando el item YA tiene reemplazos estructurados, la
 * fila estructurada REEMPLAZA al texto legado "Alternativas: ..." congelado en `notes` (si no,
 * el alumno lee la misma lista dos veces). Cualquier otra nota del coach se conserva tal cual;
 * sin estructura, cae al `notes` legado completo — no rompe planes viejos.
 *
 * IMPLEMENTACION UNICA (dedupe 2026-09-02): el "Hoy" web ya no tiene copia propia —
 * `apps/web/src/app/c/[coach_slug]/nutrition-v2/_components/nutrition-today.logic.ts` la
 * RE-EXPORTA desde aca (igual que `apps/mobile/lib/nutrition-v2-plan.ts` en RN), asi que sus
 * consumidores (`PlanVariantCard`, `TodayExperience`) conservan su import y leen esta funcion.
 */
export function resolveItemDisplayNote(
  notes: string | null | undefined,
  hasStructuredSubstitutions: boolean,
): string | null {
  const trimmed = notes?.trim() ?? ''
  if (trimmed.length === 0) return null
  if (hasStructuredSubstitutions && trimmed.startsWith(LEGACY_ALTERNATIVES_NOTE_PREFIX)) return null
  return notes ?? null
}

// ---------------------------------------------------------------------------
// De donde salen los reemplazos: el read model del plan, o el select directo.
// ---------------------------------------------------------------------------

/** Mapa `prescriptionItemId -> reemplazos`. Vacio ⇒ la tarjeta queda identica a antes de SUB-T10. */
export type PlanSubstitutionsByItem = Readonly<Record<string, readonly PlanItemSubstitutionLike[]>>

/**
 * Referencia ESTABLE para "sin reemplazos". Importa que sea una sola: RN la pasa como prop a
 * cards memoizadas y un `{}` inline recompondria el arbol en cada render.
 */
export const EMPTY_PLAN_SUBSTITUTIONS: PlanSubstitutionsByItem = Object.freeze({})

/** Item prescrito del read model, en lo minimo que mira esta capa. */
export interface PlanReadItemWithSubstitutions extends PlanItemWithSubstitutions {
  id: string
}

/** Variante de dia del read model, en lo minimo que mira esta capa. */
export interface PlanReadVariantWithSubstitutions {
  mealSlots: readonly { prescriptionItems: readonly PlanReadItemWithSubstitutions[] }[]
}

/**
 * Reemplazos por item A PARTIR del read model del plan, o `null` si el plan no los trae.
 *
 * `get_nutrition_plan_read_v2` incluye `substitutions` en cada item prescrito desde la migracion
 * `20260902220850_nutrition_v2_plan_read_substitutions` — SIEMPRE presente, array vacio cuando el
 * coach no cargo ninguno. Antes de eso, web y RN hacian UN select extra RLS-scoped por version
 * sobre `nutrition_item_substitutions_v2`; ese camino sigue vivo como FALLBACK porque una app
 * vieja (OTA anterior) o una cache RN escrita antes de la migracion no tienen la clave.
 *
 * Deteccion, a proposito por presencia de clave y no por contenido: `[]` es una respuesta VALIDA
 * del RPC nuevo ("este item no tiene reemplazos") y no debe disparar la lectura extra. Basta que
 * UN item traiga la clave para dar por nuevo al plan entero — el RPC la construye para todos.
 *
 * - devuelve un mapa (posiblemente vacio) ⇒ el llamador NO consulta la tabla;
 * - devuelve `null` ⇒ RPC viejo o cache previa: el llamador cae al select directo;
 * - plan sin items prescritos ⇒ mapa vacio: no hay nada que resolver, tampoco con el select.
 */
export function planSubstitutionsByItem(
  variants: Iterable<PlanReadVariantWithSubstitutions>,
): PlanSubstitutionsByItem | null {
  const byItem: Record<string, readonly PlanItemSubstitutionLike[]> = {}
  let sawKey = false
  let sawItem = false
  for (const variant of variants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.prescriptionItems) {
        sawItem = true
        if (item.substitutions === undefined) continue
        sawKey = true
        const subs = item.substitutions ?? []
        if (subs.length > 0) byItem[item.id] = subs
      }
    }
  }
  if (sawItem && !sawKey) return null
  return byItem
}
