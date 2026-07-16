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
  getNutritionCoachHubV2ForWeb,
  nutritionV2CoachScopeFromWorkspace,
} from '@/services/nutrition-v2-read.service'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { createClient } from '@/lib/supabase/server'
import {
  NUTRITION_PRO_UPGRADE_HREF,
  filterHistoryDaysToBaseWindow,
  hasNutritionProV2,
  nutritionProCtxFromWorkspace,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import { AssignPlanToClientsDialog, type AssignRosterEntry } from '../_components/AssignPlanToClientsDialog'

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

  // Gate del addon Nutricion Pro: sin addon, el historial del alumno para el coach se
  // limita a la ventana BASE (~30 dias). Los RPC de lectura no aceptan corte temporal,
  // asi que recortamos server-side post-fetch (ver nutrition-pro.ts). El alumno no cambia.
  const supabase = await createClient()
  const nutritionProEnabled = await hasNutritionProV2(
    supabase,
    nutritionProCtxFromWorkspace(user.id, workspace),
  )
  const recentDays = nutritionProEnabled
    ? detail.recentDays
    : filterHistoryDaysToBaseWindow(detail.recentDays, today)

  // Roster del workspace para "Asignar a otros alumnos": solo se carga si hay plan publicado.
  // Pagina el hub scoped (keyset por updatedAt) hasta un tope y excluye al alumno fuente.
  let assignRoster: AssignRosterEntry[] = []
  if (hasPlan) {
    const collected: AssignRosterEntry[] = []
    let cursor: { updatedAt: string; clientId: string } | null = null
    for (let page = 0; page < 8; page += 1) {
      const hub = await getNutritionCoachHubV2ForWeb({
        scope,
        cursorUpdatedAt: cursor?.updatedAt ?? null,
        cursorClientId: cursor?.clientId ?? null,
        pageSize: 50,
      })
      for (const item of hub.items) {
        if (item.clientId === clientId) continue
        collected.push({
          clientId: item.clientId,
          clientName: item.clientName,
          hasPlan: item.planStatus === 'published',
        })
      }
      if (!hub.hasMore || !hub.nextCursor) break
      cursor = hub.nextCursor
    }
    assignRoster = collected
  }

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
          {hasPlan && detail.plan.plan ? (
            <AssignPlanToClientsDialog
              sourceClientId={clientId}
              sourcePlanVersion={detail.plan.plan.versionNumber}
              sourcePlanName={detail.plan.plan.name}
              roster={assignRoster}
              today={today}
            />
          ) : null}
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
          illustration="sin-plan"
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
            {!nutritionProEnabled ? (
              <Link
                href={NUTRITION_PRO_UPGRADE_HREF}
                className="mb-3 inline-flex items-center gap-2 rounded-control border border-border-subtle bg-surface-sunken px-3 py-2 text-xs text-muted transition-colors hover:text-strong"
              >
                <LockKeyhole className="h-3.5 w-3.5 text-ember-600 dark:text-ember-300" />
                Historico completo con Nutricion Pro
              </Link>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recentDays.map((day) => (
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
