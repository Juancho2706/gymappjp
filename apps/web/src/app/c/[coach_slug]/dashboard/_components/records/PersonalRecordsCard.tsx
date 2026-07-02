import { Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getClientBasePath } from '@/lib/client/base-path'
import { getPersonalRecords } from '../../_data/dashboard.queries'
import { PersonalRecordsList } from './PersonalRecordsList'

/**
 * Records personales (diseño eva-app): card OSCURA (inverse) con header "trophy · Records personales",
 * grilla 2 columnas de PRs — kg grande en sport-500 + nombre del lift + FECHA (`achievedAt`), badge
 * "NUEVO" si es reciente. Cada trofeo es tappable → `PRDetailSheet` con la progresión del lift.
 *
 * RSC: resuelve datos + base path; la grilla interactiva (`PersonalRecordsList`) es cliente y pide
 * el detalle on-demand por server action.
 */
export async function PersonalRecordsCard({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const prs = await getPersonalRecords(userId)
    if (prs.length === 0) return null

    const base = await getClientBasePath(coachSlug)

    return (
        <Card variant="inverse" padding="md">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-sport-400">
                <Trophy className="h-[13px] w-[13px]" /> Records personales
            </div>
            <PersonalRecordsList prs={prs} base={base} />
        </Card>
    )
}
