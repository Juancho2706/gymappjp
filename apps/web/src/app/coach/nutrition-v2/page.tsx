import { redirect } from 'next/navigation'
import { NutritionPageShell } from '@/components/nutrition-v2'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { assertDomainEnabled } from '@/services/feature-prefs.service'
import {
  getNutritionCoachHubV2ForWeb,
  getNutritionCoachRosterV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { NutritionHubTabs } from './_components/NutritionHubTabs'
import { NutritionFirstRunEmpty } from './_components/NutritionFirstRunEmpty'
import { HubTourGuide } from './_components/HubTourGuide'
import { HubRoster } from './_components/HubRoster'
import { NewPlanPickerButton, type NewPlanPickerEntry } from './_components/NewPlanPickerButton'
import {
  localDateOf,
  mapHubMetrics,
  parseCursorScore,
  parseRosterFilters,
  serverSortFor,
} from './_lib/hub-roster'
import {
  getCoachOnboardingEmptyContext,
  templatesForSurface,
} from '../_data/onboarding-empty.queries'

const COACH_TIMEZONE = 'America/Santiago'

interface Props {
  searchParams: Promise<{
    cursorUpdatedAt?: string
    cursorClientId?: string
    cursorScore?: string
    q?: string
    attn?: string
    sort?: string
  }>
}

export default async function CoachNutritionV2Page({ searchParams }: Props) {
  const query = await searchParams
  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  if (workspace?.type === 'enterprise_coach') redirect('/coach/nutrition-plans')

  // Gate de dominio (Ola de orden W1): visibilidad, nunca autorización. El coach enterprise ya
  // salió por el redirect de arriba, así que acá el contexto nunca es de org.
  const activeTeamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  await assertDomainEnabled('nutrition', {
    coachId: user.id,
    clientTeamId: activeTeamId,
    clientOrgId: null,
  })

  // Propagate the active workspace to the scoped RPC so the roster never mixes coach pools.
  const scope = nutritionV2CoachScopeFromWorkspace(workspace)

  // Busqueda y orden viajan al RPC (migracion 20260805211949). El triage es el default: sin
  // `?sort=` el roster llega ordenado por riesgo, no por "quien se edito ultimo". En ese modo
  // el keyset necesita ademas `cursorScore`, si no la pagina 2 repite a los mas urgentes.
  const initialFilters = parseRosterFilters(query)
  const hub = await getNutritionCoachHubV2ForWeb({
    scope,
    cursorUpdatedAt: query.cursorUpdatedAt ?? null,
    cursorClientId: query.cursorClientId ?? null,
    cursorScore: parseCursorScore(query.cursorScore),
    pageSize: 25,
    search: initialFilters.search,
    sort: serverSortFor(initialFilters.sort),
  })

  // NUT-026: primera pagina alfabetica del roster para el picker global "Nuevo plan". Antes
  // aqui vivia un bucle de 8 paginas x 50 sobre el hub scoped (8 round-trips encadenados en
  // el render, tope silencioso de 400 alumnos, busqueda client-side sobre el array truncado).
  // Ahora el picker busca server-side (`searchCoachRosterAction`) y esta pagina es solo el
  // estado inicial del dialogo.
  const initialRoster = await getNutritionCoachRosterV2ForWeb({ scope, pageSize: 50 })
  const pickerRoster: NewPlanPickerEntry[] = initialRoster.items.map((item) => ({
    clientId: item.clientId,
    clientName: item.clientName ?? 'Alumno',
    planStatus: item.planStatus,
  }))

  const todayLocalDate = localDateOf(new Date().toISOString(), COACH_TIMEZONE) ?? ''
  const metrics = mapHubMetrics(hub.items, { todayLocalDate, timeZone: COACH_TIMEZONE })

  // Primer uso del Centro: NINGUN alumno tiene plan todavia (y el coach no esta filtrando).
  // El vacio va arriba del roster con las plantillas de pauta, no una ilustracion
  // (SPEC coach-onboarding-v2 §7, TASKS F3.6).
  const onboarding = await getCoachOnboardingEmptyContext()
  const firstRun =
    initialFilters.search.trim() === '' &&
    initialFilters.attention === 'all' &&
    hub.items.every((item) => item.planId == null)
  const pickerClients = pickerRoster.map((entry) => ({
    id: entry.clientId,
    name: entry.clientName,
    isDemo: entry.clientId === onboarding.demoClientId,
  }))

  return (
    // Header compacto del shell (backHref): [flecha al dashboard][titulo+desc][CTA primaria].
    // Una sola CTA visible ("Nuevo plan"); V1 es legacy saliente y vive como link discreto
    // al pie, no como pill protagonista en el header.
    <NutritionPageShell
      flushMobile
      backHref="/coach/dashboard"
      title="Centro de Nutrición"
      description="Planes, consumo reciente y alumnos por atender."
      /* Guía Viva: el «?» va PRIMERO, o sea pegado al título (D2: «inline junto al título», nunca
         flotante) y a la izquierda de la CTA. Es la fila del encabezado que compone esta página; el
         velo del tour lo monta el mismo componente y se portalea al <body>. */
      actions={
        <>
          <HubTourGuide coachId={user.id} />
          <NewPlanPickerButton roster={pickerRoster} hasMore={initialRoster.hasMore} />
        </>
      }
    >
      {firstRun ? (
        <div className="mb-4">
          <NutritionFirstRunEmpty
            templates={templatesForSurface('nutrition', onboarding.persona)}
            clients={pickerClients}
            demoClientId={onboarding.demoClientId}
            demoName={onboarding.demoName}
            demoLabel={onboarding.demoLabel}
            noun={onboarding.noun}
          />
        </div>
      ) : null}
      <NutritionHubTabs
        coachId={user.id}
        roster={
          <HubRoster
            items={hub.items}
            metrics={metrics}
            hasMore={hub.hasMore}
            nextCursor={hub.nextCursor}
            initialFilters={initialFilters}
            todayIso={todayLocalDate}
            timeZone={COACH_TIMEZONE}
          />
        }
      />
    </NutritionPageShell>
  )
}
