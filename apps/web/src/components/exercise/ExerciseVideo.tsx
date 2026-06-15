'use client'

import { exerciseEmbedUrl } from '@/lib/youtube'

/**
 * Player de video de EJERCICIO: iframe de youtube-nocookie (silencioso, autoplay, en loop, sin
 * controles — se comporta como GIF). Honra el recorte `start`/`end` vía los params del embed: el
 * video arranca en `start` y corta en `end`.
 *
 * Confiable: SIN la API JS de YouTube (IFrame Player API), que probó ser INESTABLE en producción
 * (carrera de carga del script + postMessage cross-origin con host nocookie) y dejaba el player en
 * BLANCO en las 4 superficies (coach/alumno/builder/ejecución). El loop nativo reinicia el video
 * completo; el recorte solo afecta el primer play — limitación aceptada a cambio de que TODOS los
 * videos rendericen siempre.
 *
 * USAR este componente en TODA superficie que reproduzca el video de un ejercicio (en vez del iframe
 * a mano) para que la regla viva en un solo lugar. host = youtube-nocookie (sin tracking, en
 * frame-src del CSP). `start`/`end` en segundos; null = comportamiento de siempre (video completo).
 */
export function ExerciseVideo({
    videoId,
    start,
    end,
    className,
    title,
}: {
    videoId: string
    start?: number | null
    end?: number | null
    className?: string
    title?: string
}) {
    const src = exerciseEmbedUrl(videoId, { start, end })
    if (!src) return null
    return (
        <iframe
            src={src}
            className={className}
            title={title}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; web-share"
            allowFullScreen={false}
            style={{ border: 0 }}
        />
    )
}
