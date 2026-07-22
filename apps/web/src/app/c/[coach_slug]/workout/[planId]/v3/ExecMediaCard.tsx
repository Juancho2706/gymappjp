'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { AlignLeft, MessageSquare, Play, Dumbbell } from 'lucide-react'
import type { ExerciseType } from '../WorkoutExecutionClient'
import { resolveExecMedia } from './exec-media'
import { CoachNoteSheet } from './CoachNoteV3'

interface ExecMediaCardProps {
    /** Ejercicio cuya media se muestra (gif/video/youtube/none, misma precedencia que el modal). */
    exercise: ExerciseType
    /** Nota del coach (block.notes ya recortada) → chip "Nota del coach" + sheet local. */
    note: string | null
    /** Abre el modal de técnica del padre (chip "Instrucciones" y placeholder YouTube). */
    openTechnique: (exercise: ExerciseType | null) => void
}

/**
 * Ejecutor V3 — tarjeta de MEDIA reutilizable (extracción pura de `ExerciseStepV3`, sin lógica de
 * motor). Renderiza el panel `exec-v3-media` 150px SIEMPRE visible con los chips glass
 * "Instrucciones" / "Nota del coach" que entran extendidos y colapsan a solo-icono ~1,5 s (one-shot
 * por EJERCICIO; reduced-motion los deja extendidos vía CSS). El chip de nota abre un sheet local.
 *
 * Se comparte entre el ejercicio SOLO (`ExerciseStepV3`) y el miembro ACTIVO de la superserie
 * (`SupersetStepV3`), que ahora se presenta igual que un ejercicio solo (requerimiento CEO 2026-07-22).
 * Sólo presentación bajo `[data-exec-v3]`; no toca guardado/draft/cola.
 */
export function ExecMediaCard({ exercise, note, openTechnique }: ExecMediaCardProps) {
    const [noteOpen, setNoteOpen] = useState(false)
    // Chips glass: entran EXTENDIDOS (estado inicial false → colapsan tras el timer). One-shot por
    // EJERCICIO (dep exercise.id) — no re-expande por serie. Reduced-motion → quedan extendidos (CSS).
    const [chipsCollapsed, setChipsCollapsed] = useState(false)
    const media = resolveExecMedia(exercise)
    const hasInstructions = (exercise.instructions?.length ?? 0) > 0 || media.kind !== 'none'

    useEffect(() => {
        setChipsCollapsed(false)
        const reduce =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (reduce) return
        const t = setTimeout(() => setChipsCollapsed(true), 1500)
        return () => clearTimeout(t)
    }, [exercise.id])

    return (
        <>
            <div className="exec-v3-media">
                <div className="exec-v3-mediachips">
                    {hasInstructions && (
                        <button
                            type="button"
                            className="exec-v3-mchip"
                            data-collapsed={chipsCollapsed ? 'true' : undefined}
                            onClick={() => openTechnique(exercise)}
                            aria-label={`Instrucciones de ${exercise.name}`}
                        >
                            <AlignLeft className="h-3.5 w-3.5" aria-hidden />
                            <span className="exec-v3-mlabel">Instrucciones</span>
                        </button>
                    )}
                    {note && (
                        <button
                            type="button"
                            className="exec-v3-mchip"
                            data-collapsed={chipsCollapsed ? 'true' : undefined}
                            onClick={() => setNoteOpen(true)}
                            aria-label="Nota del coach"
                        >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                            <span className="exec-v3-mlabel">Nota del coach</span>
                            <span className="exec-v3-badge" aria-hidden />
                        </button>
                    )}
                </div>

                {media.kind === 'video' && (
                    <video
                        src={media.src}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="h-full w-full object-contain"
                    />
                )}
                {media.kind === 'image' && (
                    <Image src={media.src} alt={exercise.name} fill unoptimized className="object-contain" />
                )}
                {media.kind === 'youtube' && (
                    <button
                        type="button"
                        onClick={() => openTechnique(exercise)}
                        className="exec-v3-media-yt"
                        aria-label={`Ver video de ${exercise.name}`}
                    >
                        <span className="exec-v3-media-play">
                            <Play className="h-6 w-6 fill-current" aria-hidden />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider">Ver video</span>
                    </button>
                )}
                {media.kind === 'none' && (
                    <div className="exec-v3-media-empty" aria-hidden>
                        <Dumbbell className="h-9 w-9" />
                    </div>
                )}
            </div>

            {/* Nota del coach — sheet OSCURA in-context (informe 15, BLOCKER): reemplaza el Dialog claro
                (bg-card/text-foreground) que salía blanco sobre el shell oscuro. Compartida con las
                pantallas tipadas (cardio/roller/movilidad) vía `CoachNoteSheet`; sin portal. */}
            <CoachNoteSheet open={noteOpen} note={note} onClose={() => setNoteOpen(false)} />
        </>
    )
}
