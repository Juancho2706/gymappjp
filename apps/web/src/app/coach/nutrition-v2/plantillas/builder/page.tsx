import Link from 'next/link'
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
import { fetchBuilderFoodsByIds } from '../../_data/plan-foods.data'
import {
  builderStateFromTemplateDraft,
  collectTemplateFoodIds,
  type RehydratedBuilderDraft,
} from '../../[clientId]/builder/_lib/rehydrate'
import { portionsKey } from '../../[clientId]/builder/_components/portions-state'
import { TEMPLATE_MODE_CLIENT_ID } from '../../_lib/template-mode'
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

/**
 * RETIRO DEL PAR VIEJO (web, 2026-08-17): la URL directa del wizard de plantillas cae SIEMPRE
 * al EDITOR UNICO en modo plantilla conservando `?template=<id>` (mismo contrato opcional).
 * Tipada `boolean` a proposito: el literal `true` volveria inalcanzable el resto del cuerpo y
 * tsc perderia el narrowing de sus guards. El cuerpo queda compilable y SIN puerta hasta la
 * tanda de demolicion (TASKS.md «Retiro del par viejo»).
 */
const WIZARD_RETIRED: boolean = true

export default async function CoachNutritionV2TemplateBuilderPage({ searchParams }: Props) {
  const query = await searchParams

  if (WIZARD_RETIRED) {
    const legacyTemplate = typeof query.template === 'string' ? query.template : null
    redirect(
      `/coach/nutrition-v2/plantillas/editor${legacyTemplate ? `?template=${encodeURIComponent(legacyTemplate)}` : ''}`,
    )
  }

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
  // Se pidio editar una plantilla concreta y no se pudo abrir: el builder en blanco es el
  // fallback correcto, pero callarlo hace creer que la plantilla quedo vacia y guardar la
  // pisaria. Mismo criterio que en el builder de alumno.
  let templateUnavailable = false
  if (templateId) {
    const template = await loadPlanTemplate(supabase as never, templateId)
    if (!template) {
      templateUnavailable = true
    } else {
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
      } else {
        templateUnavailable = true
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
      {templateUnavailable ? (
        <div
          role="status"
          className="mb-4 rounded-card border border-amber-300/70 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <p className="text-xs font-semibold leading-relaxed text-amber-900 dark:text-amber-200">
            No pudimos abrir la plantilla que elegiste.
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
            Puede estar borrada o fuera de tu alcance. Estás en un builder en blanco: si guardas
            acá, no estarás actualizando esa plantilla.
          </p>
        </div>
      ) : null}
      {/* Lo que confundió al coach JP (2026-08-11): esta pantalla es casi idéntica al builder de
          un alumno, así que edito la plantilla y di por hecho que su alumno ya tenía la dieta.
          Una plantilla no le llega a nadie hasta que se aplica, y eso hay que decirlo acá. */}
      <div className="mb-4 flex flex-col gap-2 rounded-card border border-primary/25 bg-primary/10 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold leading-relaxed text-primary">
          Esto es una plantilla: no le llega a ningún alumno hasta que la apliques.
        </p>
        {templateId ? (
          <Link
            href="/coach/nutrition-v2?tab=plantillas"
            className="shrink-0 text-xs font-semibold text-primary underline underline-offset-2"
          >
            Aplicar a un alumno
          </Link>
        ) : null}
      </div>
      <PlanBuilderClient
        clientId={TEMPLATE_MODE_CLIENT_ID}
        existingPlan={null}
        initialDraft={initialDraft}
        today={today}
        nutritionProEnabled={nutritionProEnabled}
        templateMode={{ templateId, description: templateDescription }}
        // Sin alumno no hay restricciones ni favoritos; el coach sí, para que el picker
        // separe "Mis alimentos" del catálogo global.
        foodPickerPrefs={{
          viewerCoachId: user.id,
          clientName: null,
          restrictions: [],
          favoriteIds: [],
        }}
      />
    </NutritionPageShell>
  )
}
