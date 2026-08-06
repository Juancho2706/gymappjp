import { cache } from 'react'
import Link from 'next/link'
import { Apple } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { MacroChipRow } from '@/components/nutrition-v2'
import { getNutritionHistoryV2ForWeb } from '@/services/nutrition-v2-read.service'
import { getTodayInSantiago } from '@/lib/date-utils'

// T1.4 (nutrition-flows-redesign): el dashboard YA NO dispara `get_nutrition_today_v2` — ese RPC
// es volatile (materializa el snapshot del dia) y el hoy del alumno se materializa UNA vez, al
// abrir nutricion. Aca se lee la cabeza del historial (`get_nutrition_history_page_v2`, read-only,
// stable): si el dia mas reciente es HOY, hay numeros; si no, card generica con CTA — el mismo
// contrato que la card de RN, que lee su cache local y degrada igual. React.cache sigue
// deduplicando entre el arbol movil y el de escritorio del mismo request.
const getHistoryHeadForDashboard = cache((clientId: string) =>
    getNutritionHistoryV2ForWeb({ clientId, pageSize: 1 }),
)

/**
 * Resumen del día de Nutrición V2 para el dashboard del alumno (surface webStudent).
 *
 * Solo lectura sobre el snapshot ya materializado: kcal consumidas / meta con barra de energía
 * en el token de marca (white-label) + zona de rango ±10% (semántica fija, T1.4) + tres macros
 * en pastillas (`MacroChipRow`, paleta de macros intacta) + CTA a la experiencia completa.
 * Sin registro hoy todavía => CTA suave hacia nutrición (paridad con la card cache-first de RN).
 * El registro y las correcciones viven en `/nutrition-v2`. Dark/claro y white-label por tokens.
 */
export async function NutritionDailySummaryV2({ clientId, base }: { clientId: string; base: string }) {
    const { iso: today } = getTodayInSantiago()
    const page = await getHistoryHeadForDashboard(clientId)
    const head = page.items[0] ?? null
    const todayRow = head && head.localDate === today ? head : null

    if (!todayRow) {
        return (
            <Card padding="lg" className="items-center gap-2 text-center">
                <Apple className="h-10 w-10 text-muted" />
                <p className="font-bold text-strong">Tu nutrición de hoy</p>
                <p className="text-xs text-muted">
                    Abre tu plan para ver las comidas de hoy y registrar la primera.
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

    const targetCal = Math.round(todayRow.targets.calories ?? 0)
    const consumedCal = Math.round(todayRow.consumed.calories)
    // Banda ±10% (T1.4): la meta es un rango, no un numero que se falla. Verde dentro,
    // ambar fuera — nunca rojo: comer no es un error. La barra escala a 120% del target
    // para que la zona [90%,110%] quede dibujada DENTRO del riel.
    const lowCal = Math.round(targetCal * 0.9)
    const highCal = Math.round(targetCal * 1.1)
    const inRange = targetCal > 0 && consumedCal >= lowCal && consumedCal <= highCal
    const scaleMax = targetCal * 1.2
    const pct = targetCal > 0 ? Math.min(100, Math.round((consumedCal / scaleMax) * 100)) : 0

    return (
        <Card padding="md" className="gap-4">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-primary/10 text-primary">
                        <Apple className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-strong">Nutrición</p>
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
                            {targetCal > 0
                                ? `/ rango ${lowCal.toLocaleString('es-CL')}–${highCal.toLocaleString('es-CL')} kcal`
                                : 'kcal'}
                        </span>
                    </div>
                    {targetCal > 0 ? (
                        inRange ? (
                            <span className="shrink-0 text-xs font-semibold text-success">✓ en tu rango</span>
                        ) : consumedCal < lowCal ? (
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
                                faltan ~{(lowCal - consumedCal).toLocaleString('es-CL')}
                            </span>
                        ) : (
                            <span className="shrink-0 text-xs font-semibold tabular-nums text-warning">
                                +{(consumedCal - highCal).toLocaleString('es-CL')} sobre tu rango
                            </span>
                        )
                    ) : null}
                </div>
                {targetCal > 0 ? (
                    <div
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={targetCal}
                        aria-valuenow={Math.min(consumedCal, targetCal)}
                        aria-label={`Energía consumida, rango objetivo ${lowCal} a ${highCal} kilocalorías`}
                        className="relative h-2 overflow-hidden rounded-pill bg-surface-sunken"
                    >
                        {/* Zona objetivo [90%,110%] del target — semantica fija (success), no white-label. */}
                        <div
                            aria-hidden="true"
                            className="absolute inset-y-0 bg-success/25"
                            style={{ left: '75%', width: '16.6%' }}
                        />
                        <div
                            className="relative h-full rounded-pill bg-primary transition-[width] duration-[var(--dur-base)]"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                ) : null}
            </div>

            <MacroChipRow
                proteinG={Math.round(todayRow.consumed.proteinG)}
                carbsG={Math.round(todayRow.consumed.carbsG)}
                fatsG={Math.round(todayRow.consumed.fatsG)}
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
