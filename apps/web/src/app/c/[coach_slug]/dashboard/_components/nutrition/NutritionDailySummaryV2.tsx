import { cache } from 'react'
import Link from 'next/link'
import { Apple } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { MacroChipRow } from '@/components/nutrition-v2'
import { getNutritionTodayV2ForWeb } from '@/services/nutrition-v2-read.service'
import { getTodayInSantiago } from '@/lib/date-utils'

// El dashboard renderiza el árbol móvil y el de escritorio en el MISMO request (visibilidad por
// CSS), así que la sección se monta dos veces. React.cache deduplica el RPC de hoy entre ambas
// (mismo patrón que las queries V1 `getActiveNutritionPlan`/`getTodayNutritionBundle`).
const getTodayV2ForDashboard = cache((clientId: string, date: string) =>
    getNutritionTodayV2ForWeb({ clientId, date }),
)

/**
 * Resumen del día de Nutrición V2 para el dashboard del alumno (surface webStudent).
 *
 * Espejo funcional de la card V1 `NutritionDailySummary` pero alimentado por el read model
 * de HOY (`get_nutrition_today_v2`): kcal consumidas / meta con barra de energía en el token
 * de marca (white-label) + tres macros en pastillas (`MacroChipRow`, paleta de macros intacta)
 * + CTA a la experiencia completa. Sin plan vigente => CTA suave hacia nutrición. Solo lectura;
 * el registro y las correcciones viven en `/nutrition-v2`. Dark/claro y white-label por tokens.
 */
export async function NutritionDailySummaryV2({ clientId, base }: { clientId: string; base: string }) {
    const { iso: today } = getTodayInSantiago()
    const model = await getTodayV2ForDashboard(clientId, today)

    if (!model.plan) {
        return (
            <Card padding="lg" className="items-center gap-2 text-center">
                <Apple className="h-10 w-10 text-muted" />
                <p className="font-bold text-strong">Aún no tienes un plan</p>
                <p className="text-xs text-muted">
                    Cuando tu coach publique tu plan, verás aquí tu resumen del día.
                </p>
                <Link
                    href={`${base}/nutrition-v2`}
                    className="mt-1 inline-flex min-h-9 items-center rounded-control bg-primary/10 px-4 text-xs font-bold text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/15"
                >
                    Ver nutrición
                </Link>
            </Card>
        )
    }

    const targetCal = Math.round(model.targets.calories ?? 0)
    const consumedCal = Math.round(model.consumed.calories)
    const remainingCal = Math.max(0, targetCal - consumedCal)
    const pct = targetCal > 0 ? Math.min(100, Math.round((consumedCal / targetCal) * 100)) : 0

    return (
        <Card padding="md" className="gap-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                        <Apple className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-strong">{model.plan.name}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-subtle">Hoy</span>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-[27px] font-black leading-none tabular-nums text-strong">
                            {consumedCal.toLocaleString('es-CL')}
                        </span>
                        <span className="text-[13px] text-muted">
                            {targetCal > 0 ? `/ ${targetCal.toLocaleString('es-CL')} kcal` : 'kcal'}
                        </span>
                    </div>
                    {targetCal > 0 ? (
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                            {remainingCal.toLocaleString('es-CL')} restantes
                        </span>
                    ) : null}
                </div>
                {targetCal > 0 ? (
                    <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={targetCal}
                        aria-valuenow={Math.min(consumedCal, targetCal)}
                        aria-label="Energía consumida"
                        className="h-2 overflow-hidden rounded-pill bg-surface-sunken"
                    >
                        <div
                            className="h-full rounded-pill bg-primary transition-[width] duration-[var(--dur-base)]"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                ) : null}
            </div>

            <MacroChipRow
                proteinG={Math.round(model.consumed.proteinG)}
                carbsG={Math.round(model.consumed.carbsG)}
                fatsG={Math.round(model.consumed.fatsG)}
                size="sm"
            />

            <Link
                href={`${base}/nutrition-v2`}
                className="block rounded-control bg-primary/10 px-4 py-2.5 text-center text-xs font-bold text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/15"
            >
                Ver nutrición →
            </Link>
        </Card>
    )
}
