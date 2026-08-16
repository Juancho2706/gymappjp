import type {
  NutritionPlanTemplateDraft,
  NutritionPlanTemplateSummary,
  NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { apiFetch } from './api'
import type { BuilderFood } from './nutrition-v2-builder'

/**
 * Cliente RN de la biblioteca de plantillas de plan V2 (F4).
 *
 * TODA lectura pasa por `/api/mobile/nutrition-v2/plan-templates`: la tabla es material interno del
 * coach y el gate de workspace + el bump de uso viven server-side. RN nunca la consulta directo.
 *
 * El tipo de lista es LOCAL a proposito: `PlanTemplateListItem` vive en `apps/web/src/services` y
 * ese import cruzado (app ↔ app) no existe en este monorepo. Aca se declara lo minimo que la UI
 * consume; lo que SI es contrato compartido (`summary`, `draft`) se importa de `@eva/nutrition-v2`.
 */

export interface NutritionV2PlanTemplateListItem {
  id: string
  name: string
  description: string | null
  strategy: string
  summary: NutritionPlanTemplateSummary | null
  isFavorite: boolean
  usageCount: number
  /** false ⇒ el draft guardado ya no valida contra el contrato: se muestra, pero no se puede abrir. */
  readable: boolean
  updatedAt: string
}

export interface NutritionV2PlanTemplateDetail {
  id: string
  name: string
  /** Descripcion de la fila (editable en el editor); null = sin descripcion. */
  description: string | null
  draft: NutritionPlanTemplateDraft
  /** Estado exacto del wizard web guardado con la plantilla (`{state, portionsBySlot}`), si existe. */
  builder: unknown
  usageCount: number
  /** Alimentos del catalogo referenciados por el draft, resueltos server-side por `foodId`. */
  foods: Record<string, BuilderFood>
  /** false ⇒ la lectura del catalogo fallo: aplicar el draft produciria items sin macros. */
  foodsComplete: boolean
}

function query(scope: NutritionV2CoachScope, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ scopeType: scope.scopeType })
  if (scope.teamId) params.set('teamId', scope.teamId)
  if (scope.orgId) params.set('orgId', scope.orgId)
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value.trim() !== '') params.set(key, value)
  }
  return `?${params.toString()}`
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toSummary(raw: unknown): NutritionPlanTemplateSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  return {
    calories: num(s.calories),
    proteinG: num(s.proteinG),
    carbsG: num(s.carbsG),
    fatsG: num(s.fatsG),
    dayVariantCount: num(s.dayVariantCount) ?? 0,
    mealSlotCount: num(s.mealSlotCount) ?? 0,
    itemCount: num(s.itemCount) ?? 0,
    hasPortions: s.hasPortions === true,
  }
}

function toListItem(raw: unknown): NutritionV2PlanTemplateListItem | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  if (typeof t.id !== 'string' || typeof t.name !== 'string') return null
  return {
    id: t.id,
    name: t.name,
    description: typeof t.description === 'string' ? t.description : null,
    strategy: typeof t.strategy === 'string' ? t.strategy : 'structured',
    summary: toSummary(t.summary),
    isFavorite: t.isFavorite === true,
    usageCount: num(t.usageCount) ?? 0,
    // Ausente (endpoint viejo) ⇒ se asume abrible: el builder degrada solo si el draft no aplica.
    readable: t.readable !== false,
    updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : '',
  }
}

/**
 * Alimento del cable -> `BuilderFood`. `category`/`media` viajan siempre nulos (el endpoint usa el
 * MISMO select que el loader web del builder, que tampoco los trae): el icono lo aporta el
 * read-model del plan, no la plantilla.
 */
function toBuilderFood(raw: unknown): BuilderFood | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  if (typeof f.id !== 'string' || typeof f.name !== 'string') return null
  return {
    id: f.id,
    name: f.name,
    brand: typeof f.brand === 'string' ? f.brand : null,
    calories: num(f.calories) ?? 0,
    proteinG: num(f.proteinG) ?? 0,
    carbsG: num(f.carbsG) ?? 0,
    fatsG: num(f.fatsG) ?? 0,
    fiberG: num(f.fiberG),
    servingSize: num(f.servingSize) ?? 100,
    servingUnit: typeof f.servingUnit === 'string' ? f.servingUnit : 'g',
    category: null,
    media: null,
  }
}

/** Biblioteca del coach para el picker "Reutilizar". Orden del servidor: NO reordenar en la UI. */
export async function fetchNutritionV2PlanTemplates(input: {
  scope: NutritionV2CoachScope
  search?: string | null
}): Promise<NutritionV2PlanTemplateListItem[]> {
  const raw = await apiFetch<{ templates?: unknown }>(
    `/api/mobile/nutrition-v2/plan-templates${query(input.scope, { search: input.search ?? '' })}`,
    { authenticated: true },
  )
  return Array.isArray(raw.templates)
    ? raw.templates
        .map(toListItem)
        .filter((item): item is NutritionV2PlanTemplateListItem => item != null)
    : []
}

/**
 * Abre una plantilla para aplicarla. Marca el uso server-side (misma semantica que la web).
 * Devuelve `null` si la respuesta no trae una plantilla utilizable; los errores HTTP (404
 * `TEMPLATE_NOT_FOUND` incluido) suben como `ApiError` para que la pantalla decida el copy.
 */
export async function fetchNutritionV2PlanTemplate(
  templateId: string,
  input: {
    scope: NutritionV2CoachScope
    /**
     * `edit` = abrir para EDITARLA en el editor unico: NO cuenta como uso (el contador ordena la
     * biblioteca por uso real). Default `apply` = cargar-para-aplicar, que si lo cuenta.
     */
    purpose?: 'apply' | 'edit'
  },
): Promise<NutritionV2PlanTemplateDetail | null> {
  const raw = await apiFetch<{ template?: unknown }>(
    `/api/mobile/nutrition-v2/plan-templates${query(input.scope, {
      id: templateId,
      ...(input.purpose === 'edit' ? { purpose: 'edit' } : {}),
    })}`,
    { authenticated: true },
  )
  const t = raw.template
  if (!t || typeof t !== 'object') return null
  const template = t as Record<string, unknown>
  if (typeof template.id !== 'string' || template.draft == null || typeof template.draft !== 'object') return null

  const foods: Record<string, BuilderFood> = {}
  if (template.foods && typeof template.foods === 'object') {
    for (const [key, value] of Object.entries(template.foods as Record<string, unknown>)) {
      const food = toBuilderFood(value)
      if (food) foods[key] = food
    }
  }

  return {
    id: template.id,
    name: typeof template.name === 'string' ? template.name : '',
    description: typeof template.description === 'string' ? template.description : null,
    draft: template.draft as NutritionPlanTemplateDraft,
    builder: template.builder ?? null,
    usageCount: num(template.usageCount) ?? 0,
    foods,
    foodsComplete: template.foodsComplete !== false,
  }
}
