import { redirect } from 'next/navigation'
import { NutritionPageShell } from '@/components/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { createClient } from '@/lib/supabase/server'
import {
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import { fetchItemSubstitutionsForVersion } from '@/app/coach/nutrition-v2/_data/item-substitutions.data'
import { fetchClientFoodPrefsForPicker } from '@/app/coach/nutrition-v2/_data/client-food-prefs.data'
import { fetchBuilderFoodsByIds } from './_data/plan-foods.data'
import { fetchBuilderClientMetrics } from './_data/client-metrics.data'
import {
  builderStateFromTemplateDraft,
  collectPlanFoodIds,
  collectTemplateFoodIds,
  rehydrateBuilderState,
} from './_lib/rehydrate'
import { parsePlanBuilderOrigin } from '@eva/nutrition-v2'
import { loadPlanTemplate, markPlanTemplateUsed } from '@/services/nutrition-v2/plan-templates.service'
import { portionsKey } from './_components/portions-state'
import { PlanBuilderClient } from './_components/PlanBuilderClient'
import { fetchRememberedQuantities } from './_data/last-quantity.data'

interface Props {
  params: Promise<{ clientId: string }>
  /**
   * `?from=template:<id>` o `?from=plan:<id>` — la UNICA puerta con origen (AD-3, F3). El modal
   * del `+` del Centro V2 y cualquier enlace profundo terminan en esta misma URL, asi no hay dos
   * caminos de creacion que diverjan en cada cambio del builder.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * ¿El `builder` guardado con la plantilla tiene la forma que espera el wizard? Es JSON
 * client-controlled: si no cuadra, se cae al adaptador sobre el draft del contrato en vez de
 * pasarle basura al reducer.
 */
function isUsableBuilderPayload(value: unknown): value is Awaited<ReturnType<typeof buildInitialDraft>> {
  if (value == null || typeof value !== 'object') return false
  const candidate = value as { state?: { variants?: unknown; strategy?: unknown } }
  return Array.isArray(candidate.state?.variants) && candidate.state.variants.length > 0
}

type PlanReadModel = Awaited<ReturnType<typeof getNutritionClientDetailV2ForWeb>>['plan']

/**
 * Arma el estado inicial del wizard desde el plan vigente. Devuelve `null` cuando alguna
 * lectura auxiliar falla: preferimos el guard anti-colapso a rehidratar a medias (publicar
 * reescribe el arbol completo, asi que un dato faltante seria una perdida silenciosa).
 */
async function buildInitialDraft(planModel: PlanReadModel, versionId: string, today: string) {
  const substitutionsLoad = await fetchItemSubstitutionsForVersion(versionId)
  if (!substitutionsLoad.ok) return null

  const foodsLoad = await fetchBuilderFoodsByIds(collectPlanFoodIds(planModel, substitutionsLoad.rows))
  if (!foodsLoad.ok) return null

  const substitutionsByItemId: Record<string, typeof substitutionsLoad.rows> = {}
  for (const row of substitutionsLoad.rows) {
    const list = substitutionsByItemId[row.prescriptionItemId] ?? []
    list.push(row)
    substitutionsByItemId[row.prescriptionItemId] = list
  }

  return rehydrateBuilderState({
    planModel,
    foods: foodsLoad.foods,
    substitutionsByItemId,
    // Version nueva: arranca vigente hoy (igual que un wizard en blanco).
    effectiveFrom: today,
    portionKeyOf: portionsKey,
  })
}

/**
 * "Reutilizar el plan de otro alumno" (`?from=plan:<clientId>`).
 *
 * El id que viaja es el del ALUMNO fuente, no el del plan: lo que se copia es su plan VIGENTE,
 * que es lo unico que el read-model scoped sirve y lo unico que el coach ve en el selector. El
 * scope del workspace vuelve a aplicarse aca — el RPC niega (42501) un alumno de otro pool, asi
 * que un id pegado a mano no copia nada.
 */
async function buildDraftFromSourcePlan(input: {
  sourceClientId: string
  scope: ReturnType<typeof nutritionV2CoachScopeFromWorkspace>
  today: string
}): Promise<{ draft: Awaited<ReturnType<typeof buildInitialDraft>>; name: string } | null> {
  let sourceDetail: Awaited<ReturnType<typeof getNutritionClientDetailV2ForWeb>>
  try {
    sourceDetail = await getNutritionClientDetailV2ForWeb({
      clientId: input.sourceClientId,
      scope: input.scope,
      date: input.today,
    })
  } catch {
    return null
  }
  const sourcePlan = sourceDetail.plan.plan
  if (!sourcePlan) return null

  const draft = await buildInitialDraft(sourceDetail.plan, sourcePlan.versionId, input.today)
  if (!draft) return null
  return { draft, name: sourcePlan.name }
}

export default async function CoachNutritionV2BuilderPage({ params, searchParams }: Props) {
  const { clientId } = await params
  const query = await searchParams
  const origin = parsePlanBuilderOrigin(typeof query.from === 'string' ? query.from : null)
  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  if (workspace?.type === 'enterprise_coach') redirect('/coach/nutrition-plans')

  // Propagate the active workspace: the scoped RPC denies (42501) a client outside this pool.
  const scope = nutritionV2CoachScopeFromWorkspace(workspace)
  const { iso: today } = getTodayInSantiago()
  const detail = await getNutritionClientDetailV2ForWeb({ clientId, scope, date: today })
  const existing = detail.plan.plan
  const existingPlan = existing
    ? {
        id: existing.id,
        // Id de la version vigente: viaja al wizard para el compare-and-swap del publish
        // (NUT-011). Si alguien publica entremedio, el RPC responde STALE_BASE.
        versionId: existing.versionId,
        versionNumber: existing.versionNumber,
        strategy: existing.strategy,
        effectiveFrom: existing.effectiveFrom,
        name: existing.name,
        // Cuántos días tiene el plan vigente. Con la rehidratación viva (abajo) el wizard los
        // edita todos; este número solo alimenta el guard de respaldo cuando la rehidratación
        // falla y publicar en blanco los borraría.
        dayVariantCount: detail.plan.dayVariants.length,
      }
    : null

  // REHIDRATACIÓN del plan vigente (FD1c): "Rehacer con el asistente" abre el wizard con los
  // N días, franjas, items, reemplazos y porciones del plan — publicar sin tocar nada produce
  // el MISMO plan. Dos lecturas auxiliares fuera del read-model hot-path:
  //  - reemplazos autorizados congelados (no viajan en el read-model),
  //  - alimentos del catálogo (el read-model trae macros congeladas, no las del alimento).
  // Cualquiera de las dos en `ok:false` ⇒ NO rehidratamos (initialDraft null): la UI cae al
  // guard anti-colapso en vez de abrir un wizard con datos mutilados.
  let initialDraft: Awaited<ReturnType<typeof buildInitialDraft>> = null
  if (existing) {
    initialDraft = await buildInitialDraft(detail.plan, existing.versionId, today)
  }

  const supabase = await createClient()

  // ORIGEN (F3). Si el coach entro por "Reutilizar", eso GANA sobre la rehidratacion del plan
  // vigente: es lo que pidio explicitamente. Un origen que no se puede leer degrada al camino
  // normal (wizard con el plan vigente, o en blanco) en vez de dejar la pantalla rota.
  let originName: string | null = null
  // El origen pedido no se pudo abrir (plantilla borrada, fuera de alcance, lectura caida). La
  // degradacion al plan vigente sigue siendo lo correcto —mejor que una pantalla rota— pero
  // TIENE que decirse: en silencio, el coach cree que esta editando su plantilla y publica el
  // plan del alumno encima. Cazado el 2026-08-11 investigando el reporte de JP, con una
  // plantilla soft-deleted que abria el plan vigente sin una palabra.
  let originUnavailable = false
  if (origin?.kind === 'template') {
    const template = await loadPlanTemplate(supabase as never, origin.id)
    if (!template) {
      originUnavailable = true
    } else {
      // OJO: el borrador de la plantilla se arma en su PROPIA variable. Escribir directo sobre
      // `initialDraft` hacia que un fallo de este bloque dejara el plan vigente del alumno
      // cargado y, peor, rotulado con el nombre de la plantilla.
      let fromTemplate = isUsableBuilderPayload(template.builder) ? template.builder : null
      if (!fromTemplate) {
        // Plantilla importada de V1 (o guardada por otra superficie): se reconstruye desde el
        // draft del contrato, resolviendo sus alimentos contra el catalogo visible del coach.
        const foodsLoad = await fetchBuilderFoodsByIds(collectTemplateFoodIds(template.draft as never))
        if (foodsLoad.ok) {
          fromTemplate = builderStateFromTemplateDraft({
            draft: template.draft as never,
            foods: foodsLoad.foods,
            clientTimezoneToday: today,
            portionKeyOf: portionsKey,
          })
        }
      }
      if (fromTemplate) {
        // La plantilla nacida del wizard web se abre EXACTA, con las macros de los items libres
        // que el contrato del draft no lleva.
        initialDraft = fromTemplate
        originName = template.name
        await markPlanTemplateUsed(supabase as never, template)
      } else {
        originUnavailable = true
      }
    }
  } else if (origin?.kind === 'plan' && origin.id !== clientId) {
    const copied = await buildDraftFromSourcePlan({ sourceClientId: origin.id, scope, today })
    if (copied) {
      initialDraft = copied.draft
      originName = copied.name
    } else {
      originUnavailable = true
    }
  }

  // Espejo UI del addon Nutricion Pro: candado en "Personalizar {dia}" (dias con contenido propio)
  // y en el checkbox de registro libre sobre planes con franjas. La barrera real vive en
  // publishPlanAction (re-valida server-side y responde UPGRADE_REQUIRED).
  const nutritionProEnabled = await hasNutritionProV2(
    supabase,
    nutritionProCtxFromWorkspace(user.id, workspace),
  )

  // Señales dietarias del alumno para el picker de alimentos del wizard (alergia bloqueante,
  // intolerancia/disgusto en ámbar, favoritos con estrellita). Server-side: el picker no las
  // vuelve a pedir desde el cliente. Fail-soft en el data-loader — son ayudas visuales.
  const foodPrefs = await fetchClientFoodPrefsForPicker(clientId)
  // Porcion pegajosa (T2.6 F4): se resuelve aca, del lado servidor, para que agregar un alimento
  // no pague un viaje de red. Fail-soft: sin memoria manda el catalogo, como siempre.
  const rememberedQuantities = await fetchRememberedQuantities(clientId)

  // Datos duros del alumno para "Sugerir metas" del paso 1 (BD1). Fail-soft en el data-loader:
  // sin ficha de ingreso (o si la lectura cae) el panel se abre igual con los campos a mano.
  const clientMetrics = await fetchBuilderClientMetrics(clientId)

  return (
    // Header compacto (backHref): flecha de vuelta + nombre del alumno en una sola fila.
    // La flecha reemplaza al boton "Volver a la ficha" (misma ruta), asi el header movil no
    // apila pills antes del titulo. Eyebrow corto para que el pill no aplaste el titulo en 390px.
    <NutritionPageShell
      flushMobile
      backHref={`/coach/nutrition-v2/${clientId}`}
      eyebrow={existingPlan ? 'Nueva versión' : 'Nuevo plan'}
      title={detail.client.fullName}
      description={
        originName
          ? `Partiendo de «${originName}». Ajusta lo que quieras antes de publicar.`
          : 'El plan y sus días, en dos pasos'
      }
    >
      {originUnavailable ? (
        <div
          role="status"
          className="mb-4 rounded-card border border-amber-300/70 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10"
        >
          <p className="text-xs font-semibold leading-relaxed text-amber-900 dark:text-amber-200">
            No pudimos abrir {origin?.kind === 'template' ? 'la plantilla' : 'el plan'} que elegiste.
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
            Puede estar borrada o fuera de tu alcance. Estás editando{' '}
            {existingPlan ? 'el plan vigente del alumno' : 'un plan en blanco'}: revisa antes de publicar.
          </p>
        </div>
      ) : null}
      <PlanBuilderClient
        clientId={clientId}
        rememberedQuantities={rememberedQuantities}
        existingPlan={existingPlan}
        initialDraft={initialDraft}
        today={today}
        nutritionProEnabled={nutritionProEnabled}
        clientMetrics={clientMetrics}
        foodPickerPrefs={{
          viewerCoachId: user.id,
          clientName: detail.client.fullName,
          restrictions: foodPrefs.restrictions,
          favoriteIds: foodPrefs.favoriteIds,
        }}
      />
    </NutritionPageShell>
  )
}
