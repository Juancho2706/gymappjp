'use client'

import { useEffect, useRef } from 'react'

// Carga unica del IFrame Player API de YouTube, compartida entre instancias.
let ytApiPromise: Promise<void> | null = null
function loadYouTubeIframeApi(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()
    const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void }
    if (w.YT?.Player) return Promise.resolve()
    if (ytApiPromise) return ytApiPromise
    ytApiPromise = new Promise<void>((resolve) => {
        const prev = w.onYouTubeIframeAPIReady
        w.onYouTubeIframeAPIReady = () => {
            prev?.()
            resolve()
        }
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(tag)
    })
    return ytApiPromise
}

type YTPlayer = {
    mute: () => void
    playVideo: () => void
    seekTo: (seconds: number, allowSeekAhead: boolean) => void
    getCurrentTime: () => number
    destroy: () => void
}

/**
 * Player de video de EJERCICIO con la API JS de YouTube. Mismo comportamiento "GIF" que el iframe
 * simple (silencioso, sin controles, en loop) PERO honra el recorte [start, end]: al terminar (o
 * al cruzar `end`) hace seekTo(start) -> el loop arranca SIEMPRE desde el start, sin reaparecer el
 * intro. Necesario porque el loop nativo de YouTube (loop=1 + playlist) reinicia desde 0 ignorando
 * el start. host = youtube-nocookie (sin tracking). Requiere www.youtube.com en script-src (CSP).
 *
 * USAR este componente en TODA superficie que reproduzca el video de un ejercicio (en vez del
 * iframe a mano) para que el recorte viva en un solo lugar. Si start/end son null se comporta como
 * el GIF-loop de siempre (loop del video completo).
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
    const hostRef = useRef<HTMLDivElement | null>(null)
    const playerRef = useRef<YTPlayer | null>(null)

    useEffect(() => {
        let cancelled = false
        let watchdog: ReturnType<typeof setInterval> | undefined
        const startAt = start != null && start > 0 ? Math.floor(start) : 0
        const endAt = end != null && end > startAt ? Math.floor(end) : null

        loadYouTubeIframeApi().then(() => {
            if (cancelled || !hostRef.current) return
            const YT = (
                window as unknown as {
                    YT: {
                        Player: new (el: HTMLElement, cfg: unknown) => YTPlayer
                        PlayerState: { ENDED: number }
                    }
                }
            ).YT

            // Mount fresco que YT reemplaza por el iframe; el host queda estable para el cleanup.
            const mount = document.createElement('div')
            mount.className = 'h-full w-full'
            hostRef.current.appendChild(mount)

            playerRef.current = new YT.Player(mount, {
                videoId,
                host: 'https://www.youtube-nocookie.com',
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 1,
                    mute: 1,
                    controls: 0,
                    modestbranding: 1,
                    rel: 0,
                    playsinline: 1,
                    disablekb: 1,
                    iv_load_policy: 3,
                    fs: 0,
                    start: startAt || undefined,
                    ...(endAt ? { end: endAt } : {}),
                },
                events: {
                    onReady: (e: { target: YTPlayer }) => {
                        e.target.mute()
                        e.target.playVideo()
                    },
                    onStateChange: (e: { data: number; target: YTPlayer }) => {
                        if (e.data === YT.PlayerState.ENDED) {
                            e.target.seekTo(startAt, true)
                            e.target.playVideo()
                        }
                    },
                },
            })

            // El evento ENDED solo dispara al final natural; con `end` recortado reiniciamos el
            // loop al cruzar el segundo de fin.
            if (endAt) {
                watchdog = setInterval(() => {
                    const p = playerRef.current
                    if (p && typeof p.getCurrentTime === 'function' && p.getCurrentTime() >= endAt) {
                        p.seekTo(startAt, true)
                        p.playVideo()
                    }
                }, 300)
            }
        })

        return () => {
            cancelled = true
            if (watchdog) clearInterval(watchdog)
            try {
                playerRef.current?.destroy()
            } catch {
                /* noop */
            }
            playerRef.current = null
            if (hostRef.current) hostRef.current.innerHTML = ''
        }
    }, [videoId, start, end])

    return <div ref={hostRef} className={className} title={title} />
}
