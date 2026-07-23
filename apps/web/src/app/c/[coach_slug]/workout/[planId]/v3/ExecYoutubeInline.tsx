'use client'

import { useRef, useState } from 'react'
import { Play, Volume2, VolumeX } from 'lucide-react'

/**
 * Ejecutor V3 (QA4 · decisión CEO 2026-07-22) — media YouTube AUTOREPRODUCIDA inline.
 *
 * El CEO pidió que el video se reproduzca solo al entrar al ejercicio en vez de tener que tocar "Ver
 * video". Antes la kind 'youtube' era un placeholder que abría el modal de técnica; ahora monta un
 * `<iframe>` de `youtube-nocookie` en autoplay + MUTE + loop del segmento del coach (respeta
 * `video_start`/`video_end`), SIN controles ni branding (se comporta como GIF). El iframe lleva
 * `pointer-events: none` para que el tap caiga en los chips/expand por encima (no en el player); el
 * botón de audio glass existente alterna el mute vía la IFrame API por postMessage (`enablejsapi=1`).
 *
 * Fallback: si el embed falla (bloqueado/`onError`), cae al placeholder "Ver video" de siempre. La cuota
 * se respeta desde el llamador: SOLO el paso activo del stepper monta este componente (igual que la media
 * actual). Compartido por `ExecMediaCard` (fuerza/superserie) y `ExecTypedMedia` (movilidad/roller/cardio).
 * Sólo presentación bajo `[data-exec-v3]`; no toca guardado/draft/cola.
 */
interface ExecYoutubeInlineProps {
    videoId: string
    /** Recorte del coach (segundos) — se aplican como `start`/`end` del embed si vienen. */
    start: number | null
    end: number | null
    exerciseName: string
    /** Fallback: abre el modal de técnica cuando el embed no puede reproducir. */
    openTechnique: () => void
}

export function ExecYoutubeInline({ videoId, start, end, exerciseName, openTechnique }: ExecYoutubeInlineProps) {
    const iframeRef = useRef<HTMLIFrameElement | null>(null)
    // Audio: arranca MUTED (requisito del autoplay del navegador); el botón glass alterna vía postMessage.
    const [muted, setMuted] = useState(true)
    // Si el embed falla (onError), degradamos al placeholder "Ver video" (abre la técnica).
    const [failed, setFailed] = useState(false)

    if (failed) {
        return (
            <button
                type="button"
                onClick={openTechnique}
                className="exec-v3-media-yt"
                aria-label={`Ver video de ${exerciseName}`}
            >
                <span className="exec-v3-media-play">
                    <Play className="h-6 w-6 fill-current" aria-hidden />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider">Ver video</span>
            </button>
        )
    }

    const params = [
        'autoplay=1',
        'mute=1',
        'loop=1',
        `playlist=${videoId}`,
        'controls=0',
        'playsinline=1',
        'rel=0',
        'enablejsapi=1',
    ]
    if (start != null && start > 0) params.push(`start=${Math.floor(start)}`)
    if (end != null && end > 0) params.push(`end=${Math.floor(end)}`)
    const src = `https://www.youtube-nocookie.com/embed/${videoId}?${params.join('&')}`

    // Alterna el mute enviando el comando de la IFrame API al iframe (no recarga el src → no reinicia).
    const toggleMute = () => {
        setMuted((prev) => {
            const next = !prev
            iframeRef.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'command', func: next ? 'mute' : 'unMute', args: [] }),
                '*',
            )
            return next
        })
    }

    return (
        <>
            <iframe
                ref={iframeRef}
                src={src}
                title={`Video de ${exerciseName}`}
                className="absolute inset-0 h-full w-full"
                style={{ border: 0, pointerEvents: 'none' }}
                allow="autoplay; encrypted-media; picture-in-picture"
                onError={() => setFailed(true)}
            />
            <button
                type="button"
                onClick={toggleMute}
                className="exec-v3-maudio"
                aria-label={muted ? 'Activar el sonido del video' : 'Silenciar el video'}
                aria-pressed={!muted}
            >
                {muted ? <VolumeX className="h-3.5 w-3.5" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
            </button>
        </>
    )
}
