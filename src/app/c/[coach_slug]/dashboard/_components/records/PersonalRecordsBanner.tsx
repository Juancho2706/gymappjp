import { getPersonalRecords } from '../../_data/dashboard.queries'
import { PRBadge } from './PRBadge'

export async function PersonalRecordsBanner({ userId }: { userId: string }) {
    const prs = await getPersonalRecords(userId)
    if (prs.length === 0) return null

    return (
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-none">
            <div className="flex w-max gap-2 py-1">
                {prs.map((pr, i) => (
                    <PRBadge key={`${pr.exerciseId}-${pr.achievedAt}`} exerciseName={pr.exerciseName} weightKg={pr.weightKg} achievedAt={pr.achievedAt} index={i} />
                ))}
            </div>
        </div>
    )
}
