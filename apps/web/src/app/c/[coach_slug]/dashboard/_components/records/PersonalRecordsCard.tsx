import { Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getPersonalRecords } from '../../_data/dashboard.queries'

/**
 * Records personales (diseño eva-app): card OSCURA (inverse) con header "trophy · Records personales",
 * grilla 2 columnas de PRs — kg grande en sport-500 + nombre del lift, badge "NUEVO" si es reciente.
 * Reemplaza el banner horizontal de chips (`PersonalRecordsBanner`) por la card del diseño.
 *
 * Mapeo de data real: `getPersonalRecords` → { exerciseName, weightKg, achievedAt }. `fresh` se deriva
 * de `achievedAt` dentro de las últimas 24 h (espejo de `pr.fresh` del mock).
 */
export async function PersonalRecordsCard({ userId }: { userId: string }) {
    const prs = await getPersonalRecords(userId)
    if (prs.length === 0) return null

    return (
        <Card variant="inverse" padding="md">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-sport-400">
                <Trophy className="h-[13px] w-[13px]" /> Records personales
            </div>
            <div className="grid grid-cols-2 gap-2.5">
                {prs.slice(0, 4).map((pr) => {
                    const fresh = pr.fresh
                    return (
                        <div
                            key={`${pr.exerciseId}-${pr.achievedAt}`}
                            className="relative flex flex-col gap-1 rounded-control bg-white/[0.05] px-3 py-2.5"
                        >
                            {fresh ? (
                                <span className="absolute right-2 top-2 rounded-pill bg-[var(--cta-fill)] px-1.5 py-px text-[8px] font-extrabold tracking-[0.03em] text-white">
                                    NUEVO
                                </span>
                            ) : null}
                            <span className="font-display text-[19px] font-black tabular-nums text-sport-500">
                                {pr.weightKg}
                                <span className="text-[10px] font-semibold text-on-dark-muted"> kg</span>
                            </span>
                            <span className="text-[11px] font-semibold leading-tight text-on-dark-muted">{pr.exerciseName}</span>
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}
