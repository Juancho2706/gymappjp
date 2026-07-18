import { redirect } from 'next/navigation'
import { NutritionPageShell } from '@/components/nutrition-v2'
import { getNutritionPlansPageCoach } from '../nutrition-plans/_data/nutrition-page.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionCoachHubV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { NutritionHubTabs } from './_components/NutritionHubTabs'
import { HubRoster } from './_components/HubRoster'
import { NewPlanPickerButton, type NewPlanPickerEntry } from './_components/NewPlanPickerButton'
import { localDateOf, mapHubMetrics, parseRosterFilters } from './_lib/hub-roster'

const COACH_TIMEZONE = 'America/Santiago'

interface Props {
  searchParams: Promise<{
    cursorUpdatedAt?: string
    cursorClientId?: string
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
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
  const enabled = await isNutritionV2Enabled({
    surface: 'webCoach',
    userId: user.id,
    coachId: user.id,
    teamId,
    orgId,
  })
  if (!enabled) redirect('/coach/nutrition-plans')

  // Propagate the active workspace to the scoped RPC so the roster never mixes coach pools.
  const scope = nutritionV2CoachScopeFromWorkspace(workspace)
  const hub = await getNutritionCoachHubV2ForWeb({
    scope,
    cursorUpdatedAt: query.cursorUpdatedAt ?? null,
    cursorClientId: query.cursorClientId ?? null,
    pageSize: 25,
  })

  // Roster completo del workspace para el picker global "Nuevo plan" (CTA sin alumno
  // seleccionado). Pagina el hub scoped (keyset por updatedAt) hasta un tope; el picker
  // filtra client-side. Independiente de la paginacion visible del roster de abajo.
  const pickerRoster: NewPlanPickerEntry[] = []
  {
    let cursor: { updatedAt: string; clientId: string } | null = null
    for (let page = 0; page < 8; page += 1) {
      const chunk = await getNutritionCoachHubV2ForWeb({
        scope,
        cursorUpdatedAt: cursor?.updatedAt ?? null,
        cursorClientId: cursor?.clientId ?? null,
        pageSize: 50,
      })
      for (const item of chunk.items) {
        pickerRoster.push({
          clientId: item.clientId,
          clientName: item.clientName,
          planStatus: item.planStatus,
        })
      }
      if (!chunk.hasMore || !chunk.nextCursor) break
      cursor = chunk.nextCursor
    }
  }

  const initialFilters = parseRosterFilters(query)
  const todayLocalDate = localDateOf(new Date().toISOString(), COACH_TIMEZONE) ?? ''
  const metrics = mapHubMetrics(hub.items, { todayLocalDate, timeZone: COACH_TIMEZONE })

  return (
    // Header compacto del shell (backHref): [flecha al dashboard][titulo+desc][CTA primaria].
    // Una sola CTA visible ("Nuevo plan"); V1 es legacy saliente y vive como link discreto
    // al pie, no como pill protagonista en el header.
    <NutritionPageShell
      flushMobile
      backHref="/coach/dashboard"
      title="Centro de Nutrición"
      description="Planes, consumo reciente y alumnos por atender."
      actions={<NewPlanPickerButton roster={pickerRoster} />}
    >
      <NutritionHubTabs
        roster={
          <HubRoster
            items={hub.items}
            metrics={metrics}
            hasMore={hub.hasMore}
            nextCursor={hub.nextCursor}
            initialFilters={initialFilters}
          />
        }
      />
    </NutritionPageShell>
  )
}
