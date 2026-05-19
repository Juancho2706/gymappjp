export interface MediaSessionTrack {
    title: string
    artist?: string
    album?: string
    artworkUrl?: string
}

export interface MediaSessionHandlers {
    play?: () => void
    pause?: () => void
    nexttrack?: () => void
    previoustrack?: () => void
    stop?: () => void
    seekforward?: (seconds?: number) => void
    seekbackward?: (seconds?: number) => void
}

type ActionHandler = (details: MediaSessionActionDetails) => void

export function isMediaSessionSupported(): boolean {
    if (typeof navigator === 'undefined') return false
    return 'mediaSession' in navigator
}

export function setMediaMetadata(track: MediaSessionTrack): void {
    if (!isMediaSessionSupported()) return
    try {
        const artwork = track.artworkUrl
            ? [
                  { src: track.artworkUrl, sizes: '96x96', type: 'image/png' },
                  { src: track.artworkUrl, sizes: '512x512', type: 'image/png' },
              ]
            : undefined

        navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.artist ?? 'EVA',
            album: track.album ?? 'Workout',
            artwork,
        })
    } catch {
        // Silent fail
    }
}

export function setMediaPlaybackState(state: MediaSessionPlaybackState): void {
    if (!isMediaSessionSupported()) return
    try {
        navigator.mediaSession.playbackState = state
    } catch {
        // Silent fail
    }
}

export function setMediaHandlers(handlers: MediaSessionHandlers): void {
    if (!isMediaSessionSupported()) return
    const entries = Object.entries(handlers) as [keyof MediaSessionHandlers, (() => void) | ((s?: number) => void) | undefined][]
    for (const [action, handler] of entries) {
        try {
            if (!handler) {
                navigator.mediaSession.setActionHandler(action as MediaSessionAction, null)
                continue
            }
            const wrapped: ActionHandler = (details) => {
                if (action === 'seekforward' || action === 'seekbackward') {
                    ;(handler as (s?: number) => void)(details.seekOffset)
                } else {
                    ;(handler as () => void)()
                }
            }
            navigator.mediaSession.setActionHandler(action as MediaSessionAction, wrapped)
        } catch {
            // Silent fail for unsupported actions
        }
    }
}

export function clearMediaSession(): void {
    if (!isMediaSessionSupported()) return
    try {
        navigator.mediaSession.metadata = null
        const actions: MediaSessionAction[] = ['play', 'pause', 'nexttrack', 'previoustrack', 'stop', 'seekforward', 'seekbackward']
        for (const a of actions) {
            navigator.mediaSession.setActionHandler(a, null)
        }
    } catch {
        // Silent fail
    }
}
