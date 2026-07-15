import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, CheckCircle2, LockKeyhole, Plus } from 'lucide-react'
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
import {
  getNutritionClientDetailV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'

interface Props {
  params: Promise<{ clientId: string }>
  searchParams: Promise<{ published?: string }>
}

export default async function CoachNutritionV2ClientPage({ params, searchParams }: Props) {
  const { clientId } = await params
  const { published } = await searchParams
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

  // Propagate the active workspace: the scoped RPC denies (42501) a client outside this pool.
  const scope = nutritionV2CoachScopeFromWorkspace(workspace)
  const { iso: today } = getTodayInSantiago()
  const detail = await getNutritionClientDetailV2ForWeb({ clientId, scope, date: today })
  const hasPlan = detail.plan.plan !== null

  return (
    <NutritionPageShell
      eyebrow="Ficha nutricional V2"
      title={detail.client.fullName}
      description="Plan vigente, consumo del dia, historial reciente y nota profesional aislada."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/coach/nutrition-v2"
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-3 text-sm font-semibold text-strong"
          >
            <ArrowLeft className="h-4 w-4" />
            Centro
          </Link>
          <Link
            href={`/coach/nutrition-v2/${clientId}/builder`}
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            {hasPlan ? 'Nueva version' : 'Crear plan'}
          </Link>
        </div>
      }
      aside={
        <NutritionCard tone="neutral">
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-4 w-4 text-ember-600" />
            <h2 className="font-display text-base font-semibold text-strong">Nota profesional</h2>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-body">
            {detail.privateNote?.note || 'Sin nota privada para la version vigente.'}
          </p>
          <p className="mt-3 text-xs text-muted">El alumno no recibe esta informacion.</p>
        </NutritionCard>
      }
    >
      {published ? (
        <div className="mb-5 flex items-center gap-2 rounded-control border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
          Plan publicado. La version quedo vigente para el alumno.
        </div>
      ) : null}

      {!detail.today.plan ? (
        <NutritionStatePanel
          title="Sin plan V2 vigente"
          description="Crea y publica una version antes de revisar objetivos y adherencia canonica."
          action={
            <Link
              href={`/coach/nutrition-v2/${clientId}/builder`}
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-ember-500 px-4 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Crear plan
            </Link>
          }
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
                {detail.today.remaining.calories ?? 0} kcal restantes segun el snapshot del dia.
              </p>
            </NutritionCard>
          </div>

          {detail.plan.dayVariants.length > 0 ? (
            <section>
              <h2 className="mb-3 font-display text-xl font-semibold text-strong">Estructura prescrita</h2>
              <div className="space-y-4">
                {detail.plan.dayVariants.map((variant) => (
                  <NutritionCard key={variant.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-display text-base font-semibold text-strong">{variant.label}</h3>
                      <span className="text-xs text-muted">
                        {variant.targets.calories ?? 0} kcal objetivo
                      </span>
                    </div>
                    {variant.mealSlots.length === 0 ? (
                      <p className="mt-2 text-sm text-muted">Plan flexible: sin franjas prescritas.</p>
                    ) : (
                      <ul className="mt-3 space-y-3">
                        {variant.mealSlots.map((slot) => (
                          <li key={slot.id} className="rounded-control border border-border-subtle bg-surface-card p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-strong">{slot.name}</span>
                              {slot.startTime ? <span className="text-xs text-muted">{slot.startTime}</span> : null}
                            </div>
                            {slot.prescriptionItems.length > 0 ? (
                              <ul className="mt-2 space-y-1">
                                {slot.prescriptionItems.map((item) => (
                                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm text-body">
                                    <span className="min-w-0 truncate">
                                      {item.name || 'Alimento'} · {item.quantity} {item.unit}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted">
                                      {Math.round(item.macros.calories ?? 0)} kcal
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="mt-2 text-xs text-muted">Sin alimentos prescritos en esta franja.</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </NutritionCard>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 font-display text-xl font-semibold text-strong">Ultimos dias</h2>
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
