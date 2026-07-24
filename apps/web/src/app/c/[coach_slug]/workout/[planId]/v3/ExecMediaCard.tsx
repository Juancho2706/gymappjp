'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AlignLeft, MessageSquare, Dumbbell } from 'lucide-react'
import type { ExerciseType } from '../WorkoutExecutionClient'
import { resolveExecMedia } from './exec-media'
import { CoachNoteSheet } from './CoachNoteV3'
import { ExecYoutubeInline } from './ExecYoutubeInline'
import { ExecMediaControls } from './ExecMediaControls'

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
    // Audio del ARCHIVO de video (kind 'video'): default SIN sonido; el botón glass alterna mute.
    const [muted, setMuted] = useState(true)
    // Pausa/reanudar del archivo de video (kind 'video') — controles glass QA5 junto al de audio.
    const [paused, setPaused] = useState(false)
    const videoRef = useRef<HTMLVideoElement | null>(null)

    // Pausa/reanuda el <video> directo y refleja el estado en el botón (Pause ↔ Play).
    const togglePause = () => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) {
            void v.play()
            setPaused(false)
        } else {
            v.pause()
            setPaused(true)
        }
    }
    // Reinicia el <video> directo al segundo 0 y reanuda.
    const restartVideo = () => {
        const v = videoRef.current
        if (!v) return
        v.currentTime = 0
        void v.play()
        setPaused(false)
    }
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

    // React no actualiza de forma fiable el atributo `muted` del <video>; la propiedad va por ref.
    useEffect(() => {
        if (videoRef.current) videoRef.current.muted = muted
    }, [muted, media.kind])

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
                    <>
                        <video
                            ref={videoRef}
                            src={media.src}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="h-full w-full object-contain"
                        />
                        <ExecMediaControls
                            muted={muted}
                            onToggleMute={() => setMuted((m) => !m)}
                            paused={paused}
                            onTogglePause={togglePause}
                            onRestart={restartVideo}
                        />
                    </>
                )}
                {media.kind === 'image' && (
                    <Image src={media.src} alt={exercise.name} fill unoptimized className="object-contain" />
                )}
                {media.kind === 'youtube' && (
                    <ExecYoutubeInline
                        videoId={media.videoId}
                        start={media.start}
                        end={media.end}
                        exerciseName={exercise.name}
                        openTechnique={() => openTechnique(exercise)}
                    />
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
