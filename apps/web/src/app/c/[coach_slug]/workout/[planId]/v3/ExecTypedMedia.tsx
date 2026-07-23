'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { AlignLeft, MessageSquare, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExerciseType } from '../WorkoutExecutionClient'
import { resolveExecMedia } from './exec-media'
import { CoachNoteSheet } from './CoachNoteV3'
import { ExecYoutubeInline } from './ExecYoutubeInline'

interface ExecTypedMediaProps {
    /** Ejercicio cuya media se muestra (misma precedencia que el modal de técnica: youtube → gif → video → imagen → none). */
    exercise: ExerciseType
    /** Nota del coach (block.notes ya recortada) → chip "Nota del coach" + sheet local (mismo patrón que fuerza). */
    note: string | null
    /** Abre el modal de técnica del padre (chip "Instrucciones" y placeholder YouTube). */
    openTechnique: (exercise: ExerciseType | null) => void
    /** Clase extra del panel (p.ej. `exec-v3-media-calm` para movilidad/roller). */
    className?: string
    /** Ícono de silueta cuando NO hay media (Move / GitCommit / HeartPulse…). */
    fallbackIcon: ReactNode
}

/**
 * Ejecutor V3 (QA4 · decisión CEO 2026-07-22) — bloque de MEDIA de las pantallas TIPADAS
 * (movilidad/roller/cardio) con el MISMO tratamiento que fuerza (`ExecMediaCard`): media por la precedencia
 * del resolver existente (`resolveExecMedia`: YouTube → iframe autoreproducido MUTED inline con botón de
 * audio; gif → gif; archivo de video mp4/webm/Storage → `<video>` en loop SIN audio por default; imagen →
 * imagen; none → silueta), y los DOS chips glass en el overlay superior-IZQUIERDO: "Instrucciones" (siempre
 * que haya algo que mostrar) + "Nota del coach" (condicional, con badge de aviso), que entran extendidos y
 * colapsan a solo-icono ~1,5s (one-shot por ejercicio; reduced-motion los deja extendidos vía CSS). El chip
 * de nota abre el sheet oscuro compartido. Sólo cuando la media es un ARCHIVO de video (kind 'video') hay
 * botón de audio glass (esquina inferior-derecha) que alterna mute. Sólo presentación bajo `[data-exec-v3]`;
 * no toca guardado.
 */
export function ExecTypedMedia({ exercise, note, openTechnique, className, fallbackIcon }: ExecTypedMediaProps) {
    const media = resolveExecMedia(exercise)
    // El chip "Instrucciones" abre la técnica: se muestra siempre que haya ALGO que mostrar (media de
    // cualquier tipo o instrucciones), no sólo videos reales (decisión CEO).
    const hasTechnique = (exercise.instructions?.length ?? 0) > 0 || media.kind !== 'none'
    const [noteOpen, setNoteOpen] = useState(false)
    const [chipsCollapsed, setChipsCollapsed] = useState(false)
    const [muted, setMuted] = useState(true)
    const videoRef = useRef<HTMLVideoElement | null>(null)

    // Colapso de los chips glass: extendidos al ENTRAR el ejercicio (one-shot por `exercise.id`), colapsan
    // a solo-icono ~1,5s después. Reduced-motion ⇒ quedan extendidos (CSS).
    useEffect(() => {
        setChipsCollapsed(false)
        const reduce =
            typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (reduce) return
        const t = setTimeout(() => setChipsCollapsed(true), 1500)
        return () => clearTimeout(t)
    }, [exercise.id])

    // React no actualiza de forma fiable el atributo `muted` del <video> en re-render — la propiedad se
    // maneja por ref (el atributo estático de abajo garantiza el arranque en silencio).
    useEffect(() => {
        if (videoRef.current) videoRef.current.muted = muted
    }, [muted, media.kind])

    return (
        <>
        <div className={cn('exec-v3-media', className)}>
            <div className="exec-v3-mediachips">
                {hasTechnique && (
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
                    <button
                        type="button"
                        onClick={() => setMuted((m) => !m)}
                        className="exec-v3-maudio"
                        aria-label={muted ? 'Activar el sonido del video' : 'Silenciar el video'}
                        aria-pressed={!muted}
                    >
                        {muted ? <VolumeX className="h-3.5 w-3.5" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
                    </button>
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
                    {fallbackIcon}
                </div>
            )}
        </div>

        {/* Nota del coach — sheet OSCURA compartida (mismo patrón que `ExecMediaCard`), sin portal. */}
        <CoachNoteSheet open={noteOpen} note={note} onClose={() => setNoteOpen(false)} />
        </>
    )
}
