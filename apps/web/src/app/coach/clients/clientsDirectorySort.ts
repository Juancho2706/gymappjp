import type { DirectoryPulseRow } from '@/services/dashboard.service'
import type { DirectorySortKey } from './directory-types'

export function defaultSortDir(key: DirectorySortKey): 'asc' | 'desc' {
    if (key === 'name_asc' || key === 'plan_days') return 'asc'
    return 'desc'
}

export function sortClientsByKey(
    clients: any[],
    pulseByClientId: Record<string, DirectoryPulseRow>,
    sortKey: DirectorySortKey,
    dir: 'asc' | 'desc'
): any[] {
    const p = (id: string) => pulseByClientId[id]

    return [...clients].sort((a, b) => {
        let cmp = 0
        switch (sortKey) {
            case 'attention_score':
                cmp =
                    (p(a.id)?.attentionScore ?? 0) - (p(b.id)?.attentionScore ?? 0)
                break
            case 'name_asc':
                cmp = a.full_name.localeCompare(b.full_name, 'es')
                break
            case 'last_activity': {
                const ta = p(a.id)?.lastWorkoutDate ?
                        new Date(p(a.id)!.lastWorkoutDate!).getTime()
                    :   0
                const tb = p(b.id)?.lastWorkoutDate ?
                        new Date(p(b.id)!.lastWorkoutDate!).getTime()
                    :   0
                cmp = ta - tb
                break
            }
            case 'adherence_desc':
                cmp = (p(a.id)?.percentage ?? 0) - (p(b.id)?.percentage ?? 0)
                break
            case 'weight_delta':
                cmp =
                    Math.abs(p(a.id)?.weightDelta7d ?? 0) -
                    Math.abs(p(b.id)?.weightDelta7d ?? 0)
                break
            case 'plan_days': {
                const va = p(a.id)?.planDaysRemaining
                const vb = p(b.id)?.planDaysRemaining
                const na = va ?? 99999
                const nb = vb ?? 99999
                cmp = na - nb
                break
            }
            default:
                cmp = 0
        }
        if (dir === 'desc') cmp = -cmp
        return cmp
    })
}
