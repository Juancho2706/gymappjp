'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Trophy, ArrowUpRight, TrendingUp, Share2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getSantiagoIsoYmdForUtcInstant } from '@/lib/date-utils'
import { canShareFiles, share } from '@/lib/web-share'
import { readShareCardBrand, renderWorkoutPRCardToBlob, type WorkoutPRCardData } from '@/lib/workout-pr-card-canvas'
import { WeightSparkline } from '../weight/WeightSparkline'
import type { ExercisePRDetail, PersonalRecordItem } from '../../_data/dashboard.queries'

/** Slug seguro para el nombre de archivo del PNG. */
function slugify(s: string): string {
    return (
        s
            .toLowerCase()
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48) || 'record'
    )
}

/** "12 jun" — fecha corta es-CL, día calendario Santiago. */
function fmtShort(iso: string): string {
    const ymd = getSantiagoIsoYmdForUtcInstant(iso)
    return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
    })
}

/** "12 de junio de 2026" — fecha larga es-CL, día calendario Santiago. */
function fmtLong(iso: string): string {
    const ymd = getSantiagoIsoYmdForUtcInstant(iso)
    return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('es-CL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    })
}

interface PRDetailSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** PR tapeado — encabezado instantáneo mientras carga el detalle. */
    pr: PersonalRecordItem | null
    detail: ExercisePRDetail | null
    loading: boolean
    /** Deep-link al catálogo con el ejercicio pre-buscado. */
    exercisesHref: string
}

export function PRDetailSheet({ open, onOpenChange, pr, detail, loading, exercisesHref }: PRDetailSheetProps) {
    const name = detail?.exerciseName ?? pr?.exerciseName ?? 'Ejercicio'
    const currentWeight = detail?.currentPr.weightKg ?? pr?.weightKg ?? null
    const currentAt = detail?.currentPr.achievedAt ?? pr?.achievedAt ?? null
    const exerciseId = detail?.exerciseId ?? pr?.exerciseId ?? null

    // Sparkline: reusa el patrón del dashboard mapeando la progresión a {iso, weight}.
    const sparkData = (detail?.history ?? []).map((p) => ({ iso: p.date, weight: p.topWeightKg }))
    // Hitos en orden descendente (el más reciente arriba).
    const milestones = [...(detail?.milestones ?? [])].reverse()
    const latest1RM = detail?.history.length ? detail.history[detail.history.length - 1].estimated1RM : null

    // ── Compartir el record vía canvas cliente (dedupe B-D5: el flujo del alumno usa la vía canvas,
    //    con el footer de marca unificado; /api/pr-card queda solo para el flujo coach). ──
    const [sharing, setSharing] = useState(false)
    // Salto previo → actual desde el hito que alcanzó el máximo actual (si lo hay).
    const topMilestone = detail?.milestones.length ? detail.milestones[detail.milestones.length - 1] : null
    const prevWeightKg = topMilestone && currentWeight != null && topMilestone.weightKg === currentWeight ? topMilestone.prevKg : 0
    const pct =
        prevWeightKg > 0 && currentWeight != null
            ? Math.round(((currentWeight - prevWeightKg) / prevWeightKg) * 1000) / 10
            : 0
    const best1RM = (detail?.history ?? []).reduce((m, p) => Math.max(m, p.estimated1RM), 0)
    const prCard: WorkoutPRCardData | null =
        currentWeight != null
            ? {
                  exerciseName: name,
                  newWeightKg: currentWeight,
                  prevWeightKg,
                  pct,
                  estimated1RM: best1RM > 0 ? best1RM : latest1RM ?? currentWeight,
              }
            : null

    async function handleShareRecord() {
        if (sharing || !prCard) return
        setSharing(true)
        try {
            const blob = await renderWorkoutPRCardToBlob(prCard, readShareCardBrand())
            if (!blob) {
                toast.error('No pudimos generar la imagen. Intentá de nuevo.')
                return
            }
            const file = new File([blob], `record-${slugify(prCard.exerciseName)}.png`, { type: 'image/png' })
            if (canShareFiles([file])) {
                await share({ files: [file], title: 'Récord personal', text: `Nuevo récord personal en ${prCard.exerciseName}` })
            } else {
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = file.name
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
                toast.success('Imagen guardada')
            }
        } finally {
            setSharing(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                className="max-h-[88dvh] sm:max-w-md sm:data-[side=right]:max-w-md"
                data-side="bottom"
            >
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <Trophy className="h-[18px] w-[18px] shrink-0 text-sport-500" />
                        {name}
                    </SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-5 overflow-y-auto p-5 pt-4">
                    {/* PR actual */}
                    <div className="rounded-card border border-border bg-muted/25 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03]">
                        <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                            Record actual
                        </p>
                        <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="font-display text-[34px] font-black leading-none tabular-nums text-sport-500">
                                {currentWeight ?? '—'}
                            </span>
                            <span className="text-sm font-semibold text-muted-foreground">kg</span>
                        </div>
                        {currentAt ? (
                            <p className="mt-1.5 text-xs text-muted-foreground">Logrado el {fmtLong(currentAt)}</p>
                        ) : null}
                        {latest1RM != null && latest1RM > 0 ? (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                                1RM estimado:{' '}
                                <span className="font-semibold text-foreground tabular-nums">{latest1RM} kg</span>
                            </p>
                        ) : null}
                    </div>

                    {/* Progresión (sparkline reusado del dashboard) */}
                    {sparkData.length >= 2 ? (
                        <div>
                            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                                <TrendingUp className="h-3 w-3" /> Progresión
                            </p>
                            <WeightSparkline data={sparkData} />
                        </div>
                    ) : null}

                    {/* Hitos superados */}
                    {loading && milestones.length === 0 ? (
                        <div className="space-y-2">
                            <div className="h-11 animate-pulse rounded-control bg-muted/40 dark:bg-white/[0.04]" />
                            <div className="h-11 animate-pulse rounded-control bg-muted/40 dark:bg-white/[0.04]" />
                        </div>
                    ) : milestones.length > 0 ? (
                        <div>
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
                                Cada vez que subiste la marca
                            </p>
                            <ul className="flex flex-col gap-1.5">
                                {milestones.map((m) => (
                                    <li
                                        key={`${m.date}-${m.weightKg}`}
                                        className="flex items-center justify-between gap-3 rounded-control border border-border bg-muted/20 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]"
                                    >
                                        <span className="font-semibold tabular-nums text-foreground">
                                            {m.prevKg > 0 ? (
                                                <>
                                                    {m.prevKg} <span className="text-muted-foreground">→</span> {m.weightKg} kg
                                                    <span className="ml-1.5 text-xs font-bold text-sport-500">+{m.deltaKg}</span>
                                                </>
                                            ) : (
                                                <>
                                                    {m.weightKg} kg{' '}
                                                    <span className="ml-1 text-xs font-medium text-muted-foreground">
                                                        primer registro
                                                    </span>
                                                </>
                                            )}
                                        </span>
                                        <span className="shrink-0 text-xs text-muted-foreground">{fmtShort(m.date)}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {/* Compartir logro — genera la share-card de record (canvas cliente) y la comparte */}
                    {prCard && exerciseId ? (
                        <button
                            type="button"
                            onClick={handleShareRecord}
                            disabled={sharing}
                            className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 rounded-control bg-sport-500 px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                            Compartir mi récord
                        </button>
                    ) : null}

                    {/* CTA técnica */}
                    <Link
                        href={exercisesHref}
                        className="flex min-h-11 items-center justify-center gap-1.5 rounded-control border border-border bg-muted/40 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.1]"
                    >
                        Ver técnica <ArrowUpRight className="h-4 w-4" />
                    </Link>
                </div>
            </SheetContent>
        </Sheet>
    )
}
