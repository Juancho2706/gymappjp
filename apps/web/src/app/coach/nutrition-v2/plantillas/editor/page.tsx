import { redirect } from 'next/navigation'
import type { NutritionPlanDraft } from '@eva/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { createClient } from '@/lib/supabase/server'
import { loadPlanTemplate } from '@/services/nutrition-v2/plan-templates.service'
import {
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import { collectTemplateFoodIds } from '../../[clientId]/builder/_lib/rehydrate'
import { fetchBuilderFoodsByIds } from '../../[clientId]/builder/_data/plan-foods.data'
import { loadExchangeGroupsForCoachAction } from '../../[clientId]/builder/_components/PortionsGroupsAction'
import { TEMPLATE_MODE_CLIENT_ID } from '../../[clientId]/builder/_lib/template-mode'
import {
  catalogToPortionGroups,
  draftToEditState,
  withSyntheticDraftIds,
  type QePortionGroup,
} from '../../[clientId]/_quick-edit/quick-edit-state'
import type { EditorTemplateInput } from '../../[clientId]/_quick-edit/QuickEditProvider'
import { TemplateEditorClient } from './TemplateEditorClient'

/**
 * EDITOR UNICO en modo PLANTILLA (T3.2b) — la version editor del builder de plantillas
 * (`plantillas/builder`): crear y editar material reutilizable del coach SIN alumno, sobre el
 * mismo lienzo del editor de planes. SIN CTA publica hasta el corte 2 (QA del owner primero).
 *
 * `?template=<id>` OPCIONAL: con id se abre para EDITAR esa plantilla (guardar la reescribe);
 * sin id, plantilla en blanco. Una plantilla ilegible (o de otro coach, via RLS) degrada a
 * editor en blanco CON AVISO y con `templateId` null — guardar ahi crea una plantilla nueva,
 * jamas pisa a ciegas la que no se pudo abrir.
 *
 * Autorizacion: sesion de coach + workspace no-enterprise (mismo perimetro que
 * `plantillas/builder`); el techo real es la RLS de `nutrition_plan_templates_v2`. El
 * `clientId` del draft es el relleno `TEMPLATE_MODE_CLIENT_ID`: no autoriza nada y el
 * guardado (`buildTemplatePayload`) lo strippea antes de escribir.
 */
interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const BLANK_PERMISSIONS: NutritionPlanDraft['permissions'] = {
  canRegisterFreely: true,
  canAdjustPrescribedQuantity: true,
  quantityAdjustmentPercent: null,
  canSubstitute: false,
  canMoveMealSlot: false,
  canSkipOptionalItems: true,
}

export default async function CoachNutritionV2TemplateEditorPage({ searchParams }: Props) {
  const query = await searchParams
  const rawTemplateId = typeof query.template === 'string' ? query.template : null
  const templateId = rawTemplateId && UUID_RE.test(rawTemplateId) ? rawTemplateId : null

  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  if (workspace?.type === 'enterprise_coach') redirect('/coach/nutrition-plans')

  const { iso: today } = getTodayInSantiago()
  const supabase = await createClient()
  const nutritionProEnabled = await hasNutritionProV2(
    supabase,
    nutritionProCtxFromWorkspace(user.id, workspace),
  )

  // Se pidio editar una plantilla concreta y no se pudo abrir: blanco CON aviso (el cliente
  // muestra el toast). Callarlo haria creer que la plantilla quedo vacia (leccion JP 11-08).
  let templateUnavailable = false
  let template: EditorTemplateInput | null = null

  if (templateId) {
    const loaded = await loadPlanTemplate(supabase as never, templateId)
    if (!loaded) {
      templateUnavailable = true
    } else {
      const foodsLoad = await fetchBuilderFoodsByIds(collectTemplateFoodIds(loaded.draft as never))
      if (!foodsLoad.ok) {
        templateUnavailable = true
      } else {
        // Snapshots de grupos para los targets de porciones: el draft solo trae ids; el
        // catalogo vivo del coach (variante SIN alumno) pone codigo/nombre/color. Fail-soft:
        // sin catalogo el target degrada visible a "Grupo no disponible".
        let portionGroupsById: Record<string, QePortionGroup> = {}
        try {
          const groupsRes = await loadExchangeGroupsForCoachAction()
          if (groupsRes.ok) {
            portionGroupsById = Object.fromEntries(
              catalogToPortionGroups(groupsRes.groups).map((group) => [group.exchangeGroupId, group]),
            )
          }
        } catch {
          /* fail-soft */
        }
        // El nombre editable es el de la FILA (el que muestra la biblioteca); al guardar, el
        // draft proyectado y la fila quedan con el mismo nombre. `effectiveFrom` null y jamas
        // elegible: una plantilla no rige desde ninguna fecha. Ids sinteticos: el draft
        // guardado no trae ids y los contadores aparean por id — sin esto la plantilla
        // abriria "con cambios" (el guardado los vuelve a strippear).
        const baseDraft: NutritionPlanDraft = withSyntheticDraftIds({
          ...loaded.draft,
          clientId: TEMPLATE_MODE_CLIENT_ID,
          effectiveFrom: null,
          name: loaded.name,
        })
        template = {
          templateId,
          initialState: draftToEditState(baseDraft, { foodsById: foodsLoad.foods, portionGroupsById }, {}),
          baseDraft,
          description: loaded.description,
        }
        // NO se llama `markPlanTemplateUsed`: abrir para editar no es usar (mismo criterio
        // que el builder de plantillas — el contador ordena la biblioteca por uso real).
      }
    }
  }

  if (!template) {
    // Plantilla en blanco (o degradacion): un dia base vacio, nombre vacio — la validacion
    // local exige nombre antes de guardar. `templateId` null: guardar CREA, nunca pisa.
    const baseDraft: NutritionPlanDraft = {
      clientId: TEMPLATE_MODE_CLIENT_ID,
      name: '',
      strategy: 'structured',
      effectiveFrom: null,
      timezone: 'America/Santiago',
      permissions: BLANK_PERMISSIONS,
      visibleNotes: null,
      privateNotes: null,
      protocolNotes: null,
      dayVariants: [
        {
          key: 'default',
          label: 'Todos los días',
          dayOfWeek: null,
          default: true,
          targets: {
            calories: null,
            proteinG: null,
            carbsG: null,
            fatsG: null,
            fiberG: null,
            sodiumMg: null,
            waterMl: null,
          },
          orderIndex: 0,
          mealSlots: [],
        },
      ],
    }
    template = {
      templateId: null,
      initialState: draftToEditState(baseDraft, {}, {}),
      baseDraft,
      description: null,
    }
  }

  return (
    <TemplateEditorClient
      template={template}
      templateUnavailable={templateUnavailable}
      today={today}
      hasNutritionPro={nutritionProEnabled}
      viewerCoachId={user.id}
    />
  )
}
