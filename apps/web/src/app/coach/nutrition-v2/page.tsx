import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, ChevronRight, Plus, Users } from 'lucide-react'
import {
  CoachAttentionCard,
  NutritionCard,
  NutritionPageShell,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import { getNutritionPlansPageCoach } from '../nutrition-plans/_data/nutrition-page.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import {
  getNutritionCoachHubV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

interface Props {
  searchParams: Promise<{
    cursorUpdatedAt?: string
    cursorClientId?: string
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

  return (
    <NutritionPageShell
      eyebrow="Canary privado"
      title="Centro de Nutrición"
      description="Revisa planes, consumo reciente y alumnos que requieren atención."
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
            title="Se habilitará con el Builder V2"
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white opacity-55"
          >
            <Plus className="h-4 w-4" />
            Nuevo plan
          </button>
        </div>
      }
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric label="Alumnos en esta página" value={hub.items.length} />
        <Metric
          label="Sin plan V2"
          value={hub.items.filter((item) => item.attentionReason === 'no_plan').length}
        />
        <Metric
          label="Con borrador pendiente"
          value={hub.items.filter((item) => item.pendingDrafts > 0).length}
        />
      </div>

      {hub.items.length === 0 ? (
        <NutritionStatePanel
          icon="empty"
          title="No hay alumnos en este scope"
          description="El Centro V2 respeta el workspace activo y no mezcla alumnos de otros equipos u organizaciones."
        />
      ) : (
        <div className="space-y-3">
          {hub.items.map((item) => (
            <NutritionCard key={item.clientId}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-display text-lg font-semibold text-strong">
                      {item.clientName}
                    </h2>
                    {item.strategy ? <StrategyBadge compact strategy={item.strategy} /> : null}
                    {item.versionNumber && item.planStatus === 'published' ? (
                      <PlanVersionBadge version={item.versionNumber} status="published" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {item.planName ?? 'Sin plan V2 publicado'} · {item.intakeEntries7d} registros en 7 días
                  </p>
                </div>
                <Link
                  href={`/coach/nutrition-v2/${item.clientId}`}
                  className="inline-flex min-h-11 items-center justify-center gap-1 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong hover:bg-surface-sunken"
                >
                  Abrir ficha
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              {item.attentionReason !== 'none' ? (
                <div className="mt-4">
                  <CoachAttentionCard
                    item={{
                      id: item.clientId,
                      title: attentionTitle(item.attentionReason),
                      description: attentionDescription(item.attentionReason),
                      reason: item.attentionReason,
                      tone: item.attentionReason === 'no_plan' ? 'warning' : 'info',
                      actionLabel: 'Revisar',
                    }}
                  />
                </div>
              ) : null}
            </NutritionCard>
          ))}
        </div>
      )}

      {hub.hasMore && hub.nextCursor ? (
        <Link
          href={`/coach/nutrition-v2?cursorUpdatedAt=${encodeURIComponent(hub.nextCursor.updatedAt)}&cursorClientId=${hub.nextCursor.clientId}`}
          className="mt-5 inline-flex min-h-11 items-center rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong"
        >
          Ver más alumnos
        </Link>
      ) : null}
    </NutritionPageShell>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <NutritionCard>
      <Users className="h-5 w-5 text-ember-600" />
      <p className="mt-3 font-display text-3xl font-bold text-strong">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </NutritionCard>
  )
}

function attentionTitle(reason: 'no_plan' | 'draft_pending' | 'no_recent_intake') {
  if (reason === 'no_plan') return 'Sin plan V2 publicado'
  if (reason === 'draft_pending') return 'Borrador pendiente'
  return 'Sin consumo reciente'
}

function attentionDescription(reason: 'no_plan' | 'draft_pending' | 'no_recent_intake') {
  if (reason === 'no_plan') return 'Este alumno todavía no tiene una prescripción versionada.'
  if (reason === 'draft_pending') return 'Existe una versión que aún no ha sido publicada.'
  return 'No hay registros canónicos durante los últimos siete días.'
}
