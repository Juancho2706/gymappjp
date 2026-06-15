'use client'

import { useEffect, useId, useRef } from 'react'
import { loadYouTubeIframeApi } from '@/lib/youtube-iframe-api'

type YTPlayer = {
    seekTo: (seconds: number, allowSeekAhead: boolean) => void
    playVideo: () => void
    getCurrentTime: () => number
    getDuration: () => number
}

/**
 * Player de video de EJERCICIO. El iframe de youtube-nocookie se renderiza SIEMPRE (autoplay, mute,
 * loop nativo, sin controles = GIF) → nunca queda en blanco. La API JS de YouTube se ATACHA al
 * iframe existente (best-effort) SOLO para:
 *   - Loop del TRAMO [start, end]: al cruzar `end` (o al terminar) hace seekTo(start) → loopea el
 *     recorte sin reaparecer la intro. Si la API no carga, el iframe igual reproduce (loop nativo
 *     del video completo). Degradación grácil — esto evita el bug del player en blanco.
 *   - `onDuration`: reporta la duración real del video (para validar el recorte en el form).
 *
 * USAR en TODA superficie que reproduzca el video de un ejercicio. host = youtube-nocookie (sin
 * tracking, en frame-src del CSP). `start`/`end` en segundos; null = video completo (loop nativo).
 */
export function ExerciseVideo({
    videoId,
    start,
    end,
    className,
    title,
    onDuration,
}: {
    videoId: string
    start?: number | null
    end?: number | null
    className?: string
    title?: string
    onDuration?: (seconds: number) => void
}) {
    const onDurationRef = useRef(onDuration)
    onDurationRef.current = onDuration
    const frameId = 'ytx-' + useId().replace(/[^a-zA-Z0-9]/g, '')

    const startAt = start != null && start > 0 ? Math.floor(start) : 0
    const endAt = end != null && end > startAt ? Math.floor(end) : null

    // Iframe SIEMPRE presente: si la API JS falla, reproduce igual (loop nativo).
    const params = new URLSearchParams({
        autoplay: '1', mute: '1', loop: '1', playlist: videoId,
        controls: '0', modestbranding: '1', rel: '0', playsinline: '1',
        disablekb: '1', iv_load_policy: '3', fs: '0', enablejsapi: '1',
    })
    if (startAt) params.set('start', String(startAt))
    const src = `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`

    useEffect(() => {
        const wantsLoop = startAt > 0 || endAt != null
        // Solo cargamos la API si hace falta (loop del tramo o medir duración).
        if (!wantsLoop && onDurationRef.current == null) return

        let cancelled = false
        let player: YTPlayer | null = null
        let watchdog: ReturnType<typeof setInterval> | undefined

        loadYouTubeIframeApi().then(() => {
            if (cancelled || !window.YT?.Player || !document.getElementById(frameId)) return
            const YT = window.YT
            try {
                player = new YT.Player(frameId, {
                    events: {
                        onReady: (e: { target: YTPlayer }) => {
                            try {
                                const d = e.target.getDuration()
                                if (d > 0) onDurationRef.current?.(d)
                            } catch { /* noop */ }
                        },
                        onStateChange: (e: { data: number; target: YTPlayer }) => {
                            if (e.data === YT.PlayerState.ENDED && wantsLoop) {
                                e.target.seekTo(startAt, true)
                                e.target.playVideo()
                            }
                        },
                    },
                }) as YTPlayer
            } catch {
                return // la API falló; el iframe sigue reproduciendo (loop nativo)
            }

            if (endAt != null) {
                // ENDED solo dispara al final natural; con `end` recortado reiniciamos al cruzarlo.
                watchdog = setInterval(() => {
                    try {
                        if (player && player.getCurrentTime() >= endAt) {
                            player.seekTo(startAt, true)
                            player.playVideo()
                        }
                    } catch { /* noop */ }
                }, 300)
            }
        })

        return () => {
            cancelled = true
            if (watchdog) clearInterval(watchdog)
            // NO destruimos el player (removería el iframe que maneja React); GC al desmontar.
        }
    }, [videoId, startAt, endAt, frameId])

    if (!videoId) return null
    return (
        <iframe
            id={frameId}
            src={src}
            className={className}
            title={title}
            referrerPolicy="strict-origin-when-cross-origin"
            allow="autoplay; encrypted-media; picture-in-picture; web-share"
            allowFullScreen={false}
            style={{ border: 0 }}
        />
    )
}
