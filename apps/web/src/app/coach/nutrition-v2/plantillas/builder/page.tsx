import { redirect } from 'next/navigation'
import { NutritionPageShell } from '@/components/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { createClient } from '@/lib/supabase/server'
import {
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import { loadPlanTemplate } from '@/services/nutrition-v2/plan-templates.service'
import { fetchBuilderFoodsByIds } from '../../[clientId]/builder/_data/plan-foods.data'
import {
  builderStateFromTemplateDraft,
  collectTemplateFoodIds,
  type RehydratedBuilderDraft,
} from '../../[clientId]/builder/_lib/rehydrate'
import { portionsKey } from '../../[clientId]/builder/_components/portions-state'
import { TEMPLATE_MODE_CLIENT_ID } from '../../[clientId]/builder/_lib/template-mode'
import { PlanBuilderClient } from '../../[clientId]/builder/_components/PlanBuilderClient'

/**
 * Builder de PLANTILLAS — crear material reutilizable SIN alumno (pedido del CEO 2026-08-04).
 *
 * Hasta hoy una plantilla solo podia nacer del borrador o del plan publicado de un alumno: un
 * coach recien llegado (cero alumnos), o uno que quiere armar material generico antes de tener
 * a quien aplicarselo, no tenia ninguna puerta. Esta ruta monta el MISMO wizard —el unico que
 * sabe producir un draft valido— en modo plantilla.
 *
 * `?template=<id>` OPCIONAL: con id se abre para EDITAR esa plantilla (y guardar la reescribe,
 * no crea una copia); sin id, wizard en blanco.
 *
 * Autorizacion: sesion de coach + workspace no-enterprise, igual que el builder de alumno pero
 * SIN `authorizeCoach(clientId)` — no hay ficha que autorizar. El techo real de la plantilla es
 * la RLS de `nutrition_plan_templates_v2` (lo propio, lo del team, lo de la org), que se aplica
 * dentro de `loadPlanTemplate` con el cliente user-scoped: un id de otro coach no devuelve fila
 * y el builder abre en blanco en vez de filtrar material ajeno.
 *
 * Gate comercial: las plantillas heredan el permiso de nutricion (decision CEO), asi que aca
 * solo se resuelve `nutritionProEnabled` para el MISMO espejo de UI del builder de alumno
 * (candado en "Personalizar dia" y en el registro libre).
 */
interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Mismo guard que la page del builder de alumno: JSON client-controlled, no se le cree. */
function isUsableBuilderPayload(value: unknown): value is RehydratedBuilderDraft {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as { state?: { variants?: unknown } }
  return Array.isArray(candidate.state?.variants) && candidate.state.variants.length > 0
}

export default async function CoachNutritionV2TemplateBuilderPage({ searchParams }: Props) {
  const query = await searchParams
  const rawTemplateId = typeof query.template === 'string' ? query.template : null
  const templateId = rawTemplateId && UUID_RE.test(rawTemplateId) ? rawTemplateId : null

  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  if (workspace?.type === 'enterprise_coach') redirect('/coach/nutrition-plans')

  const { iso: today } = getTodayInSantiago()
  const supabase = await createClient()

  // Plantilla en edicion. Igual que en el builder de alumno: si trae el payload del wizard se
  // abre EXACTA (con las macros de los items libres, que el contrato del draft no lleva); si
  // no, se reconstruye desde el draft canonico resolviendo sus alimentos contra el catalogo
  // visible del coach. Una plantilla ilegible (o de otro coach) degrada a builder en blanco.
  let initialDraft: RehydratedBuilderDraft | null = null
  let templateName: string | null = null
  let templateDescription: string | null = null
  if (templateId) {
    const template = await loadPlanTemplate(supabase as never, templateId)
    if (template) {
      const fromBuilder = isUsableBuilderPayload(template.builder) ? template.builder : null
      if (fromBuilder) {
        initialDraft = fromBuilder
      } else {
        const foodsLoad = await fetchBuilderFoodsByIds(collectTemplateFoodIds(template.draft as never))
        if (foodsLoad.ok) {
          initialDraft = builderStateFromTemplateDraft({
            draft: template.draft as never,
            foods: foodsLoad.foods,
            clientTimezoneToday: today,
            portionKeyOf: portionsKey,
          })
        }
      }
      if (initialDraft) {
        templateName = template.name
        templateDescription = template.description
      }
    }
  }

  // NO se llama `markPlanTemplateUsed`: abrir una plantilla para EDITARLA no es usarla. El
  // contador ordena la biblioteca por "la que aplico siempre"; inflarlo al editar lo volveria
  // ruido.

  const nutritionProEnabled = await hasNutritionProV2(
    supabase,
    nutritionProCtxFromWorkspace(user.id, workspace),
  )

  return (
    <NutritionPageShell
      flushMobile
      backHref="/coach/nutrition-v2"
      eyebrow={templateName ? 'Editar plantilla' : 'Nueva plantilla'}
      title={templateName ?? 'Plantilla de plan'}
      description={
        templateName
          ? 'Cambia lo que quieras y guarda: se actualiza esta misma plantilla.'
          : 'Arma un plan reutilizable, sin elegir alumno. Lo aplicas cuando quieras.'
      }
    >
      <PlanBuilderClient
        clientId={TEMPLATE_MODE_CLIENT_ID}
        existingPlan={null}
        initialDraft={initialDraft}
        today={today}
        nutritionProEnabled={nutritionProEnabled}
        templateMode={{ templateId, description: templateDescription }}
      />
    </NutritionPageShell>
  )
}
