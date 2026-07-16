import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
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

  const initialFilters = parseRosterFilters(query)
  const todayLocalDate = localDateOf(new Date().toISOString(), COACH_TIMEZONE) ?? ''
  const metrics = mapHubMetrics(hub.items, { todayLocalDate, timeZone: COACH_TIMEZONE })

  return (
    <NutritionPageShell
      eyebrow="Canary privado"
      title="Centro de Nutricion"
      description="Revisa planes, consumo reciente y alumnos que requieren atencion."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/coach/nutrition-plans"
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a V1
          </Link>
          <button
            disabled
            title="Elige un alumno del roster para crear su plan"
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white opacity-55"
          >
            <Plus className="h-4 w-4" />
            Nuevo plan
          </button>
        </div>
      }
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
