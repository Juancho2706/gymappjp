// Carga ÚNICA y robusta del IFrame Player API de YouTube, compartida entre instancias.
// Resuelve por callback `onYouTubeIframeAPIReady` O por poll (el callback puede ser consumido por
// otra carga). Timeout de 10s resuelve igual: el consumidor revalida `window.YT?.Player` antes de
// usarlo, así que un fallo de carga NO rompe nada (el iframe ya reproduce por sus params de URL).

declare global {
    interface Window {
        YT?: {
            Player: new (elOrId: HTMLElement | string, cfg: unknown) => unknown
            PlayerState: { ENDED: number; PLAYING: number }
        }
        onYouTubeIframeAPIReady?: () => void
    }
}

let ytApiPromise: Promise<void> | null = null

export function loadYouTubeIframeApi(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()
    if (window.YT?.Player) return Promise.resolve()
    if (ytApiPromise) return ytApiPromise

    ytApiPromise = new Promise<void>((resolve) => {
        let done = false
        const finish = () => {
            if (done) return
            done = true
            clearInterval(poll)
            resolve()
        }

        const prev = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => {
            prev?.()
            finish()
        }

        const t0 = Date.now()
        const poll = setInterval(() => {
            if (window.YT?.Player) finish()
            else if (Date.now() - t0 > 10_000) finish() // timeout: resolver igual (degradación grácil)
        }, 200)

        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const tag = document.createElement('script')
            tag.src = 'https://www.youtube.com/iframe_api'
            document.head.appendChild(tag)
        }
    })

    return ytApiPromise
}
