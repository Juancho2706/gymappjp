import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import {
  MacroBudget,
  NutritionCard,
  NutritionPageShell,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
} from '@/components/nutrition-v2'
import { createNutritionMacroValue } from '@eva/nutrition-v2'
import { getTodayInSantiago } from '@/lib/date-utils'
import { getNutritionPlansPageCoach } from '../../nutrition-plans/_data/nutrition-page.queries'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { getNutritionClientDetailV2ForWeb } from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

interface Props {
  params: Promise<{ clientId: string }>
}

export default async function CoachNutritionV2ClientPage({ params }: Props) {
  const { clientId } = await params
  const { user } = await getNutritionPlansPageCoach()
  if (!user) redirect('/login')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
  const enabled = await isNutritionV2Enabled({
    surface: 'webCoach',
    userId: user.id,
    clientId,
    coachId: user.id,
    teamId,
    orgId,
  })
  if (!enabled) redirect('/coach/nutrition-plans')

  const { iso: today } = getTodayInSantiago()
  const detail = await getNutritionClientDetailV2ForWeb({ clientId, date: today })

  return (
    <NutritionPageShell
      eyebrow="Ficha nutricional V2"
      title={detail.client.fullName}
      description="Plan vigente, consumo del día, historial reciente y nota profesional aislada."
      actions={
        <Link
          href="/coach/nutrition-v2"
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
        >
          <ArrowLeft className="h-4 w-4" />
          Centro
        </Link>
      }
      aside={
        <NutritionCard tone="neutral">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-ember-600" />
            <h2 className="font-display text-base font-semibold text-strong">Nota profesional</h2>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-body">
            {detail.privateNote?.note || 'Sin nota privada para la versión vigente.'}
          </p>
          <p className="mt-3 text-xs text-muted">El alumno no recibe esta información.</p>
        </NutritionCard>
      }
    >
      {!detail.today.plan ? (
        <NutritionStatePanel
          title="Sin plan V2 vigente"
          description="Crea y publica una versión antes de revisar objetivos y adherencia canónica."
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StrategyBadge strategy={detail.today.plan.strategy} />
            <PlanVersionBadge
              version={detail.today.plan.versionNumber}
              status={detail.today.plan.status}
              effectiveLabel={`desde ${detail.today.plan.effectiveFrom}`}
            />
          </div>

          <MacroBudget
            calories={{
              consumed: detail.today.consumed.calories,
              target: detail.today.targets.calories ?? 0,
            }}
            macros={[
              createNutritionMacroValue('protein', {
                consumed: detail.today.consumed.proteinG,
                target: detail.today.targets.proteinG ?? 0,
              }),
              createNutritionMacroValue('carbs', {
                consumed: detail.today.consumed.carbsG,
                target: detail.today.targets.carbsG ?? 0,
              }),
              createNutritionMacroValue('fats', {
                consumed: detail.today.consumed.fatsG,
                target: detail.today.targets.fatsG ?? 0,
              }),
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <NutritionCard>
              <h2 className="font-display text-lg font-semibold text-strong">Plan vigente</h2>
              <p className="mt-1 text-sm text-muted">{detail.plan.plan?.name}</p>
              <p className="mt-3 text-sm leading-6 text-body">
                {detail.plan.visibleNotes || 'Sin indicaciones visibles.'}
              </p>
            </NutritionCard>
            <NutritionCard>
              <h2 className="font-display text-lg font-semibold text-strong">Hoy</h2>
              <p className="mt-1 text-sm text-muted">
                {detail.today.consumed.entryCount} registro{detail.today.consumed.entryCount === 1 ? '' : 's'} · {detail.today.mealSlots.length} franjas
              </p>
              <p className="mt-3 text-sm text-body">
                {detail.today.remaining.calories ?? 0} kcal restantes según el snapshot del día.
              </p>
            </NutritionCard>
          </div>

          <section>
            <h2 className="mb-3 font-display text-xl font-semibold text-strong">Últimos días</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {detail.recentDays.map((day) => (
                <NutritionCard key={day.localDate}>
                  <p className="font-semibold text-strong">{day.localDate}</p>
                  <p className="mt-1 text-sm text-muted">
                    {day.consumed.calories} kcal · {day.activeEntryCount} registros
                  </p>
                </NutritionCard>
              ))}
            </div>
          </section>
        </div>
      )}
    </NutritionPageShell>
  )
}
