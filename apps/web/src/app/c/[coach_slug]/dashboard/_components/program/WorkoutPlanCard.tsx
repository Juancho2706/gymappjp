'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, CircleDashed, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBasePath } from '@/components/client/BasePathProvider'
import {
    buildWorkoutDoneEditHref,
    buildWorkoutRepeatHref,
    buildWorkoutRecoverHref,
    weekdayNameFromIso,
    doneAttributionLabel,
} from '@/lib/workout/executor-recovery'
import { WorkoutDoneSheet } from './WorkoutDoneSheet'
import { useWorkoutLaunch } from '../launch/WorkoutLaunchMorph'
import { getTodayInSantiago } from '@/lib/date-utils'
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
    /** Fracción [0,1] de series registradas del día (sólo para el a11y label de "En progreso"). */
    completionPct: number
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

    const todayIso = getTodayInSantiago().iso
    // Fecha REAL de la sesión del sheet: si el día se recuperó en otra fecha manda `doneOnDate`, no
    // la fecha de la celda. Una sola fuente para editar / repetir / decidir si repetir se ofrece.
    const sessionDate = sheetItem ? (sheetItem.doneOnDate ?? sheetItem.dateIso) : null

    return (
        <>
            {/* Carrusel horizontal de day-cards 96px (kit alumno-dashboard.jsx:413-424). */}
            <div className="hide-scrollbar -ml-0.5 flex gap-2 overflow-x-auto pl-0.5">
                {plans.map((p) => {
                    const dow = p.day_of_week ?? 1
                    const done = p.status === 'done'
                    const pending = p.status === 'pending'
                    // Tercera visual (spec `workout-day-in-progress`): empezado y sin cerrar.
                    const inProgress = p.status === 'in_progress'
                    const isToday = p.isToday
                    // Sub-label de la celda: recuperado → "Hecho el jueves"; resto conserva "Día N" / "Pendiente".
                    const subLabel = inProgress
                        ? 'En progreso'
                        : pending
                          ? 'Pendiente'
                          : done && p.doneOnLabel
                            ? doneAttributionLabel(p.doneOnLabel)
                            : `Día ${dow}`

                    // "En progreso" toma el MISMO lenguaje visual de la celda de hoy (ramp sport,
                    // white-label) y se separa por el borde punteado: empezado ≠ cerrado. Gana sobre
                    // `isToday` porque un día de hoy a medias es, ante todo, un día a medias.
                    const cardClass = cn(
                        'block w-24 shrink-0 rounded-control border p-3 text-left transition-colors',
                        inProgress
                            ? 'border-dashed border-sport-400 bg-sport-100 hover:bg-sport-200'
                            : isToday
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
                                        inProgress || isToday
                                            ? 'text-sport-600'
                                            : pending
                                              ? 'text-ember-700'
                                              : 'text-subtle'
                                    )}
                                >
                                    {DAYS[dow - 1]}
                                </span>
                                {done ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--success-500)]" />
                                ) : inProgress ? (
                                    <CircleDashed className="h-3.5 w-3.5 shrink-0 text-sport-600" />
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
                                    inProgress
                                        ? 'font-bold text-sport-600'
                                        : pending
                                          ? 'font-bold text-ember-700'
                                          : 'text-subtle'
                                )}
                            >
                                {subLabel}
                            </p>
                        </>
                    )

                    // QA7: TODO día COMPLETO (hecho HOY o en OTRO día de la semana) abre el sheet de
                    // doble intención ("Ya hiciste este entrenamiento" → Revisar y editar / Repetir hoy).
                    // El morph NO se dispara aquí: sale de la opción elegida en el sheet (onLaunch). Antes
                    // el día hecho HOY navegaba directo con `?desde=hecho` y se saltaba la ventanita (bug QA CEO).
                    // Un día PASADO a medias abre el MISMO sheet con el copy "Entrenamiento incompleto"
                    // (misma doble intención); el de HOY jamás lo abre: sigue directo al ejecutor.
                    const opensSheet = done || (inProgress && !isToday)
                    if (opensSheet) {
                        const pctLabel = `${Math.round(p.completionPct * 100)}%`
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setSheetItem(p)}
                                aria-label={
                                    done
                                        ? `${p.title} · ${p.doneOnLabel ? doneAttributionLabel(p.doneOnLabel) : 'hecho'}, revisar o repetir`
                                        : `${p.title} · entrenamiento incompleto (${pctLabel}), revisar o repetir`
                                }
                                className={cardClass}
                            >
                                {inner}
                            </button>
                        )
                    }

                    // Resto → morph directo: pendiente de la semana → recuperar (banner ámbar); HOY a
                    // medias → flujo normal de hoy (el ejecutor retoma donde quedó); resto → normal.
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
                                inProgress
                                    ? `${p.title} · en progreso (${Math.round(p.completionPct * 100)}%), continuar`
                                    : pending
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

            {sheetItem && sessionDate ? (
                <WorkoutDoneSheet
                    open={sheetItem != null}
                    onOpenChange={(o) => { if (!o) setSheetItem(null) }}
                    // Día a medias: el titular NO puede decir "ya hiciste este entrenamiento" (era
                    // justo el trap del incidente P0). Las dos intenciones sí son las mismas.
                    heading={
                        sheetItem.status === 'in_progress'
                            ? 'Entrenamiento incompleto'
                            : 'Ya hiciste este entrenamiento'
                    }
                    title={sheetItem.title}
                    subtitle={`${weekdayNameFromIso(sheetItem.dateIso)} — Día ${sheetItem.day_of_week ?? 1} · ${fmtShortDate(sheetItem.dateIso)}`}
                    // Sesión de HOY (celda de hoy hecha, o día recuperado HOY desde otra celda) → flujo
                    // normal de hoy (`?desde=hecho`). Solo una sesión REALMENTE pasada usa `?fecha=`.
                    // Incidente 2026-07-26: la celda de otro día recuperada HOY mandaba `?fecha=<hoy>`,
                    // que abre el modo solo-UPDATE del día pasado y no inserta series nuevas — el alumno
                    // perdió todo lo que registró después de la serie 1.
                    editHref={buildWorkoutDoneEditHref(base, sheetItem.id, sessionDate, todayIso, sheetItem.isToday)}
                    // Repetir siembra los valores de la fecha REAL de la sesión (la misma que edita el
                    // botón de arriba): `doneOnDate` cuando el día se recuperó en otra fecha.
                    repeatHref={buildWorkoutRepeatHref(base, sheetItem.id, sessionDate)}
                    // Si esa sesión es de HOY, repetir pisaría la misma fila (índice único por día) → se oculta.
                    showRepeat={sessionDate !== todayIso}
                    onLaunch={launch}
                />
            ) : null}
            {morph}
        </>
    )
}
