import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Users } from 'lucide-react'
import { TierBadge } from '@/components/nutrition/TierBadge'
import type { NutritionOversight } from '../_data/nutrition-oversight.queries'

interface Props {
  oversight: NutritionOversight
  nutritionProEnabled: boolean
}

const STATUS_META = {
  ok: {
    label: 'En rango',
    icon: CheckCircle2,
    className: 'bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300',
  },
  review: {
    label: 'Revisar',
    icon: AlertTriangle,
    className: 'bg-warning-100 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300',
  },
  missing: {
    label: 'Sin registros',
    icon: ClipboardList,
    className: 'bg-surface-sunken text-muted',
  },
} as const

function SummaryCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-card border border-subtle bg-surface-card p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-subtle">{label}</p>
      <p className="eva-metric mt-1 text-[25px] font-black text-strong">{value}</p>
      <p className="mt-1 text-[11px] font-semibold text-muted">{hint}</p>
    </div>
  )
}

export function NutritionProfessionalOverview({ oversight, nutritionProEnabled }: Props) {
  const { rows, summary } = oversight
  if (rows.length === 0) return null

  const visibleRows = rows.slice(0, 12)

  return (
    <section className="mx-auto w-full max-w-[2000px] space-y-3">
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-ember-500" />
            <h2 className="font-display text-lg font-extrabold tracking-tight text-strong">Seguimiento de hoy</h2>
            <TierBadge tier={nutritionProEnabled ? 'pro' : 'base'} />
          </div>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Compara lo prescrito, las comidas marcadas y el consumo real adicional. Las alertas son reglas transparentes, no diagnósticos automáticos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <SummaryCard label="Alumnos activos" value={summary.activeClients} hint="Con plan vigente" />
        <SummaryCard label="Registraron consumo" value={summary.clientsWithIntake} hint="Alimentos adicionales hoy" />
        <SummaryCard label="Requieren revisión" value={summary.clientsToReview} hint="Por registro, rango o adherencia" />
        <SummaryCard label="Adherencia media" value={`${summary.averageAdherence}%`} hint="Promedio de 7 días" />
      </div>

      <div className="overflow-hidden rounded-card border border-subtle bg-surface-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead className="bg-surface-sunken">
              <tr className="text-[10px] font-black uppercase tracking-wider text-subtle">
                <th className="px-4 py-3">Alumno</th>
                <th className="px-3 py-3 text-right">Plan</th>
                <th className="px-3 py-3 text-right">Adicional</th>
                <th className="px-3 py-3 text-right">Total / meta</th>
                <th className="px-3 py-3 text-right">Adherencia</th>
                <th className="px-3 py-3">Estado</th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const meta = STATUS_META[row.status]
                const Icon = meta.icon
                return (
                  <tr key={row.clientId} className="border-t border-subtle text-[12.5px] transition-colors hover:bg-surface-sunken/50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-strong">{row.clientName}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{row.planName}</p>
                    </td>
                    <td className="eva-mono px-3 py-3 text-right font-bold tabular-nums text-body">
                      {row.planCaloriesConsumed} kcal
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="eva-mono font-bold tabular-nums text-ember-700 dark:text-ember-300">
                        +{row.extraCaloriesConsumed} kcal
                      </p>
                      {nutritionProEnabled && row.intakeCount > 0 && (
                        <p className="mt-0.5 font-mono text-[9.5px] font-semibold tabular-nums text-muted">
                          P {row.extraProtein} · C {row.extraCarbs} · G {row.extraFats}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <p className="eva-mono font-black tabular-nums text-strong">
                        {row.totalCaloriesConsumed} / {row.targetCalories || '—'}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] font-bold tabular-nums text-muted">
                        {row.caloriePercent}%
                      </p>
                    </td>
                    <td className="eva-mono px-3 py-3 text-right font-bold tabular-nums text-body">
                      {row.adherence7d}%
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${meta.className}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </span>
                      <p className="mt-1 max-w-[190px] text-[10px] leading-snug text-muted">{row.reason}</p>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/coach/nutrition-plans/client/${row.clientId}`}
                        aria-label={`Abrir nutrición de ${row.clientName}`}
                        className="flex h-9 w-9 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {rows.length > visibleRows.length && (
          <p className="border-t border-subtle px-4 py-3 text-center text-xs font-semibold text-muted">
            Mostrando los {visibleRows.length} casos con mayor prioridad de {rows.length} alumnos.
          </p>
        )}
      </div>
    </section>
  )
}
