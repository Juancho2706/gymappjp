'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBasePath } from '@/components/client/BasePathProvider'
import {
    buildWorkoutEditHref,
    buildWorkoutRepeatHref,
    buildWorkoutFromDoneHref,
    buildWorkoutRecoverHref,
    weekdayNameFromIso,
    doneAttributionLabel,
} from '@/lib/workout/executor-recovery'
import { WorkoutDoneSheet } from './WorkoutDoneSheet'
import { useWorkoutLaunch } from '../launch/WorkoutLaunchMorph'
import type { WeekDayStatus } from '../../_data/weekPendingWorkouts'

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export type WorkoutPlanCardItem = {
    id: string
    title: string
    day_of_week: number | null
    /** Estado del día en la semana actual (derivado en el server, ver `deriveWeekWorkoutStatus`). */
    status: WeekDayStatus
    /** True si esta card es el día de HOY (mantiene el realce aunque ya esté hecho). */
    isToday: boolean
    /** Fecha ISO `YYYY-MM-DD` de la celda (día de esta semana). Alimenta la edición del día pasado. */
    dateIso: string
    /**
     * Si el día quedó `done` por una sesión hecha en OTRO día (recuperación), fecha ISO de esa sesión;
     * `null` cuando se hizo en su propia fecha. Es la fecha real a EDITAR (cae a `dateIso` si es null).
     */
    doneOnDate: string | null
    /** Nombre del día de `doneOnDate` (p. ej. "Jueves") para el label "Hecho el jueves". `null` si no aplica. */
    doneOnLabel: string | null
}

/** "15 jul" — fecha corta es-CL de una fecha de calendario ISO (mediodía UTC, sin corrimiento). */
function fmtShortDate(iso: string): string {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    })
}

export function WorkoutPlanCards({
    coachSlug,
    plans,
}: {
    coachSlug: string
    plans: WorkoutPlanCardItem[]
}) {
    const base = useBasePath(`/c/${coachSlug}`)
    // Sheet de doble intención: se abre al tocar un día hecho en OTRO día de la semana.
    const [sheetItem, setSheetItem] = useState<WorkoutPlanCardItem | null>(null)
    // QA6: morph de lanzamiento desde el rect de la card (mismo destino de navegación).
    const { launch, morph } = useWorkoutLaunch()

    return (
        <>
            {/* Carrusel horizontal de day-cards 96px (kit alumno-dashboard.jsx:413-424). */}
            <div className="hide-scrollbar -ml-0.5 flex gap-2 overflow-x-auto pl-0.5">
                {plans.map((p) => {
                    const dow = p.day_of_week ?? 1
                    const done = p.status === 'done'
                    const pending = p.status === 'pending'
                    const isToday = p.isToday
                    // Sub-label de la celda: recuperado → "Hecho el jueves"; resto conserva "Día N" / "Pendiente".
                    const subLabel = pending
                        ? 'Pendiente'
                        : done && p.doneOnLabel
                          ? doneAttributionLabel(p.doneOnLabel)
                          : `Día ${dow}`

                    const cardClass = cn(
                        'block w-24 shrink-0 rounded-control border p-3 text-left transition-colors',
                        isToday
                            ? 'border-sport-500 bg-sport-100'
                            : pending
                              ? 'border-ember-200 bg-ember-100 hover:bg-ember-200'
                              : 'border-subtle bg-surface-card hover:bg-surface-sunken'
                    )

                    const inner = (
                        <>
                            <div className="flex items-center justify-between">
                                <span
                                    className={cn(
                                        'text-[10.5px] font-extrabold uppercase tracking-wide',
                                        isToday ? 'text-sport-600' : pending ? 'text-ember-700' : 'text-subtle'
                                    )}
                                >
                                    {DAYS[dow - 1]}
                                </span>
                                {done ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success-500)]" />
                                ) : isToday ? (
                                    <Play className="h-3 w-3 shrink-0 text-sport-600" />
                                ) : pending ? (
                                    <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-ember-500" />
                                ) : (
                                    <ChevronRight className="h-[13px] w-[13px] shrink-0 text-[var(--ink-300)]" />
                                )}
                            </div>
                            <p className="mt-1.5 line-clamp-2 text-[13px] font-bold leading-tight text-strong">{p.title}</p>
                            <p
                                className={cn(
                                    'mt-0.5 text-[10.5px]',
                                    pending ? 'font-bold text-ember-700' : 'text-subtle'
                                )}
                            >
                                {subLabel}
                            </p>
                        </>
                    )

                    // QA7: TODO día con registros (hecho HOY o en OTRO día de la semana) abre el sheet de
                    // doble intención ("Ya hiciste este entrenamiento" → Revisar y editar / Repetir hoy).
                    // El morph NO se dispara aquí: sale de la opción elegida en el sheet (onLaunch). Antes
                    // el día hecho HOY navegaba directo con `?desde=hecho` y se saltaba la ventanita (bug QA CEO).
                    if (done) {
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setSheetItem(p)}
                                aria-label={`${p.title} · ${p.doneOnLabel ? doneAttributionLabel(p.doneOnLabel) : 'hecho'}, revisar o repetir`}
                                className={cardClass}
                            >
                                {inner}
                            </button>
                        )
                    }

                    // Sin registros → morph directo: pendiente de la semana → recuperar (banner ámbar); resto → normal.
                    const href = pending && p.dateIso
                        ? buildWorkoutRecoverHref(base, p.id, p.dateIso)
                        : buildWorkoutRepeatHref(base, p.id)
                    return (
                        <Link
                            key={p.id}
                            href={href}
                            onClick={(e) => {
                                // QA6: el MISMO morph que el CTA, disparado desde el rect de la card.
                                e.preventDefault()
                                launch(e.currentTarget, href)
                            }}
                            aria-label={
                                pending
                                    ? `${p.title} · pendiente, recuperar`
                                    : isToday
                                      ? `${p.title} · hoy`
                                      : p.title
                            }
                            className={cardClass}
                        >
                            {inner}
                        </Link>
                    )
                })}
            </div>

            {sheetItem ? (
                <WorkoutDoneSheet
                    open={sheetItem != null}
                    onOpenChange={(o) => { if (!o) setSheetItem(null) }}
                    title={sheetItem.title}
                    subtitle={`${weekdayNameFromIso(sheetItem.dateIso)} — Día ${sheetItem.day_of_week ?? 1} · ${fmtShortDate(sheetItem.dateIso)}`}
                    // HOY hecho → editar es el flujo normal de hoy (`?desde=hecho`, sin modo UPDATE-only de
                    // día pasado); OTRO día → editar esa fecha con `?fecha=`.
                    editHref={sheetItem.isToday
                        ? buildWorkoutFromDoneHref(base, sheetItem.id)
                        : buildWorkoutEditHref(base, sheetItem.id, sheetItem.doneOnDate ?? sheetItem.dateIso)}
                    repeatHref={buildWorkoutRepeatHref(base, sheetItem.id)}
                    onLaunch={launch}
                />
            ) : null}
            {morph}
        </>
    )
}
