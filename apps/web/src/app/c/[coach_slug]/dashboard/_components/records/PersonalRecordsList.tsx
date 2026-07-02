'use client'

import { useCallback, useState, useTransition } from 'react'

import { getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import { getExercisePRHistoryAction } from '../../_actions/dashboard.actions'
import type { ExercisePRDetail, PersonalRecordItem } from '../../_data/dashboard.queries'
import { PRDetailSheet } from './PRDetailSheet'

/** "12 jun" — fecha corta es-CL, día calendario Santiago. */
function fmtShort(iso: string): string {
    const ymd = getSantiagoIsoYmdForUtcInstant(iso)
    return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    })
}

interface PersonalRecordsListProps {
    prs: PersonalRecordItem[]
    /** Base path del alumno (`/c/[slug]` o rewrite `/e|/t`) para el deep-link al catálogo. */
    base: string
}

/**
 * Grilla de records tappable: cada trofeo muestra el peso + nombre + fecha (`achievedAt`), y al
 * tocarlo abre el `PRDetailSheet` con la progresión histórica del lift (pedida on-demand vía
 * server action). El diseño de la card (inverse/oscura) se mantiene 1:1 con el kit.
 */
export function PersonalRecordsList({ prs, base }: PersonalRecordsListProps) {
    const [open, setOpen] = useState(false)
    const [selected, setSelected] = useState<PersonalRecordItem | null>(null)
    const [detail, setDetail] = useState<ExercisePRDetail | null>(null)
    const [loading, startLoad] = useTransition()

    const openPr = useCallback((pr: PersonalRecordItem) => {
        setSelected(pr)
        setDetail(null)
        setOpen(true)
        startLoad(async () => {
            const d = await getExercisePRHistoryAction(pr.exerciseId)
            setDetail(d)
        })
    }, [])

    const exercisesHref = selected
        ? `${base}/exercises?q=${encodeURIComponent(selected.exerciseName)}`
        : `${base}/exercises`

    return (
        <>
            <div className="grid grid-cols-2 gap-2.5">
                {prs.slice(0, 4).map((pr) => (
                    <button
                        key={`${pr.exerciseId}-${pr.achievedAt}`}
                        type="button"
                        onClick={() => openPr(pr)}
                        className="relative flex flex-col gap-1 rounded-control bg-white/[0.05] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.09] active:scale-[0.98]"
                    >
                        {pr.fresh ? (
                            <span className="absolute right-2 top-2 rounded-pill bg-[var(--cta-fill)] px-1.5 py-px text-[8px] font-extrabold tracking-[0.03em] text-white">
                                NUEVO
                            </span>
                        ) : null}
                        <span className="font-display text-[19px] font-black tabular-nums text-sport-500">
                            {pr.weightKg}
                            <span className="text-[10px] font-semibold text-on-dark-muted"> kg</span>
                        </span>
                        <span className="text-[11px] font-semibold leading-tight text-on-dark-muted">{pr.exerciseName}</span>
                        <span className="text-[10px] tabular-nums text-on-dark-muted/70">{fmtShort(pr.achievedAt)}</span>
                    </button>
                ))}
            </div>

            <PRDetailSheet
                open={open}
                onOpenChange={setOpen}
                pr={selected}
                detail={detail}
                loading={loading}
                exercisesHref={exercisesHref}
            />
        </>
    )
}
