'use client'

/**
 * Ejecutor V3 (Unidad B3 · QA1) — sheet de TÉCNICA oscura in-context. Reemplaza el `<Dialog>` shadcn
 * en tema CLARO (blanco) que se abría sobre el shell oscuro (informe 15, BLOCKER): el mockup
 * `concepto-a-v3-core` (`.a3a-sheet`) pide un bottom-sheet oscuro (#1d1d26, handle, sin blur) que no
 * saca al alumno del ejercicio. Mismo CONTENIDO que el modal legacy (media con la misma prioridad
 * estricta + instrucciones numeradas + "Entendido"), sólo cambia la piel:
 *
 *  - Superficie #1d1d26 (reusa `.exec-v3-settings` para posición/animación/handle) con la media
 *    full-bleed en letterbox OSCURO (#050507), no el `bg-white`/`bg-muted` del legacy.
 *  - Instrucciones con el badge numérico teñido de la MARCA (`--exec-brand`), no azul Sport fijo.
 *
 * Se monta DENTRO del wrapper `[data-exec-v3]` (acento resuelto, sin portal) igual que
 * `SubstituteSheetV3` / `ExecSettingsSheet`. El modal legacy queda intacto para el ejecutor V2.
 */

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Maximize2, X } from 'lucide-react'
import { extractYoutubeVideoId } from '@/lib/youtube'
import { ExerciseVideo } from '@/components/exercise/ExerciseVideo'
import { resolveExecMedia } from './exec-media'
import type { ExerciseType } from '../WorkoutExecutionClient'

interface Props {
    /** Ejercicio a explicar (null ⇒ cerrado). */
    exercise: ExerciseType | null
    onClose: () => void
}

/** Media del ejercicio — MISMA prioridad estricta que el modal legacy, en letterbox OSCURO. */
function TechniqueMedia({ exercise }: { exercise: ExerciseType }) {
    const isYouTube = exercise.video_url?.includes('youtube.com') || exercise.video_url?.includes('youtu.be')
    const ytId = exercise.video_url ? extractYoutubeVideoId(exercise.video_url) : null

    if (isYouTube && ytId) {
        return (
            <div className="relative flex h-48 w-full shrink-0 items-center justify-center bg-[#050507] md:h-64">
                <ExerciseVideo
                    videoId={ytId}
                    start={exercise.video_start_time}
                    end={exercise.video_end_time}
                    className="h-full w-full"
                    title={exercise.name}
                />
            </div>
        )
    }
    if (exercise.gif_url) {
        return (
            <div className="relative flex h-48 w-full shrink-0 items-center justify-center bg-[#050507] md:h-64">
                <Image src={exercise.gif_url} alt={exercise.name} fill unoptimized className="object-contain p-4" />
            </div>
        )
    }
    if (exercise.video_url) {
        const u = exercise.video_url.toLowerCase()
        const isMp4 =
            u.includes('.mp4') ||
            u.includes('.mov') ||
            u.includes('.webm') ||
            (u.includes('supabase.co/storage') && !u.includes('.gif') && !u.includes('.jpg') && !u.includes('.png'))
        if (isMp4) {
            return (
                <div className="relative flex h-48 w-full shrink-0 items-center justify-center bg-[#050507] md:h-64">
                    <video src={exercise.video_url} autoPlay loop muted playsInline className="h-full w-full object-contain" />
                </div>
            )
        }
        return (
            <div className="relative flex h-48 w-full shrink-0 items-center justify-center bg-[#050507] md:h-64">
                <Image src={exercise.video_url} alt={exercise.name} fill unoptimized className="object-contain" />
            </div>
        )
    }
    return null
}

/**
 * Lightbox de multimedia a pantalla completa (QA4 · hallazgo CEO): la media del sheet de técnica se
 * amplía a `fixed inset-0` sobre un fondo oscuro, centrada y grande, con X y tap-al-fondo para cerrar.
 * Reusa la MISMA precedencia (`resolveExecMedia`) que el resto del ejecutor. z-index por encima del
 * sheet de técnica (61) para que quede al frente.
 */
function TechniqueLightbox({ exercise, onClose }: { exercise: ExerciseType; onClose: () => void }) {
    const reducedMotion = useReducedMotion()
    const media = resolveExecMedia(exercise)
    if (media.kind === 'none') return null

    return (
        <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Multimedia de ${exercise.name}`}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0 }}
            onClick={onClose}
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar multimedia"
                className="absolute right-4 top-[calc(16px+env(safe-area-inset-top,0px))] z-10 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition-colors hover:bg-black/80"
            >
                <X className="h-5 w-5" />
            </button>
            {/* stopPropagation: el tap sobre la media NO cierra (sólo el fondo). */}
            <div
                className="relative flex aspect-video w-[92vw] max-w-3xl items-center justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                {media.kind === 'youtube' && (
                    <ExerciseVideo
                        videoId={media.videoId}
                        start={media.start}
                        end={media.end}
                        className="h-full w-full"
                        title={exercise.name}
                    />
                )}
                {media.kind === 'video' && (
                    <video
                        src={media.src}
                        autoPlay
                        loop
                        controls
                        playsInline
                        className="max-h-[85vh] max-w-full object-contain"
                    />
                )}
                {media.kind === 'image' && (
                    <Image src={media.src} alt={exercise.name} fill unoptimized className="object-contain" />
                )}
            </div>
        </motion.div>
    )
}

export function TechniqueSheetV3({ exercise, onClose }: Props) {
    const reducedMotion = useReducedMotion()
    const steps = exercise?.instructions ?? null
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const hasMedia = exercise ? resolveExecMedia(exercise).kind !== 'none' : false

    // El lightbox no debe quedar abierto al cerrar/cambiar de ejercicio (el estado sobrevive al desmontar
    // condicional del sheet). Se resetea cuando cambia el ejercicio (incluye null = cerrado).
    useEffect(() => {
        setLightboxOpen(false)
    }, [exercise?.id])

    return (
        <AnimatePresence>
            {exercise && (
                <>
                    <motion.button
                        type="button"
                        aria-label="Cerrar técnica"
                        onClick={onClose}
                        className="exec-v3-sheet-scrim"
                        initial={reducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={reducedMotion ? undefined : { opacity: 0 }}
                    />
                    <motion.div
                        className="exec-v3-settings"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Técnica de ${exercise.name}`}
                        style={{ background: '#1d1d26', padding: 0, overflow: 'hidden' }}
                        initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
                        exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                        transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 38 }}
                    >
                        <div className="pt-2.5">
                            <span className="exec-v3-handle" aria-hidden />
                        </div>

                        <div className="relative shrink-0">
                            <TechniqueMedia exercise={exercise} />
                            {hasMedia && (
                                <button
                                    type="button"
                                    onClick={() => setLightboxOpen(true)}
                                    aria-label="Ampliar multimedia"
                                    className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white transition-colors hover:bg-black/80"
                                >
                                    <Maximize2 className="h-4 w-4" aria-hidden />
                                </button>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-5">
                            <div className="mb-4 flex items-start justify-between gap-4">
                                <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-on-dark">
                                    {exercise.name}
                                </h2>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    aria-label="Cerrar"
                                    className="-mr-2 -mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-on-dark-muted transition-colors hover:bg-white/[0.06] hover:text-on-dark"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {steps && steps.length > 0 ? (
                                <ol className="space-y-3">
                                    {steps.map((step, i) => (
                                        <li key={i} className="flex gap-3 text-sm text-on-dark-muted">
                                            <span
                                                className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                                style={{
                                                    backgroundColor: 'color-mix(in srgb, var(--exec-brand) 15%, transparent)',
                                                    color: 'var(--exec-brand)',
                                                }}
                                            >
                                                {i + 1}
                                            </span>
                                            <span className="leading-relaxed">{step.replace(/^Step:\d+\s*/i, '')}</span>
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="text-sm text-on-dark-muted">
                                    No hay instrucciones detalladas disponibles para este ejercicio.
                                </p>
                            )}

                            <button
                                type="button"
                                onClick={onClose}
                                className="mt-6 w-full shrink-0 rounded-control border border-[var(--border-inverse)] bg-white/[0.06] py-3 font-bold text-on-dark transition-colors hover:bg-white/[0.10]"
                            >
                                Entendido
                            </button>
                        </div>
                    </motion.div>

                    <AnimatePresence>
                        {lightboxOpen && (
                            <TechniqueLightbox exercise={exercise} onClose={() => setLightboxOpen(false)} />
                        )}
                    </AnimatePresence>
                </>
            )}
        </AnimatePresence>
    )
}
