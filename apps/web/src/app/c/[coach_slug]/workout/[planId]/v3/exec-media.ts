import { extractYoutubeVideoId, isYoutubeMediaUrl } from '@/lib/youtube'
import type { ExerciseType } from '../WorkoutExecutionClient'

/**
 * Ejecutor V3 (E2.4) — resolución de la media pasiva del ejercicio, EXTRAÍDA 1:1 de la lógica
 * inline del modal de técnica de `WorkoutExecutionClient` (mismo orden de precedencia y mismas
 * heurísticas de extensión). Se usa en el panel de media SIEMPRE visible de `ExerciseStepV3`.
 *
 * Precedencia (idéntica al modal): YouTube → gif → video (mp4/webm/mov o Storage no-imagen) →
 * imagen directa → sin media. La cuota de media animada se respeta desde el llamador (sólo el paso
 * activo del stepper monta el panel), no acá.
 *
 * YouTube NUNCA va inline: se resuelve como placeholder + chip que abre el modal de técnica
 * existente (que ya monta `ExerciseVideo` con el embed). El resto es media local same-origin.
 */
export type ExecMedia =
    | { kind: 'video'; src: string }
    | { kind: 'image'; src: string }
    | { kind: 'youtube'; videoId: string; start: number | null; end: number | null }
    | { kind: 'none' }

export function resolveExecMedia(exercise: ExerciseType): ExecMedia {
    const url = exercise.video_url
    // QA4 · hallazgo 17: la detección va por el parser central (allowlist de hosts, incluye
    // `youtube-nocookie.com`), NUNCA por `url.includes('youtube.com')` — ese substring dejaba fuera los 33
    // ejercicios guardados como `www.youtube-nocookie.com/embed/<id>`, que caían a `kind:'image'` y el
    // `<Image>` intentaba renderizar una página HTML de embed.
    const isYouTube = isYoutubeMediaUrl(url)
    if (isYouTube) {
        const videoId = url ? extractYoutubeVideoId(url) : null
        if (videoId) {
            return { kind: 'youtube', videoId, start: exercise.video_start_time, end: exercise.video_end_time }
        }
        // Host de YouTube sin id extraíble: sin media (tratarlo como imagen siempre falla).
        return exercise.gif_url ? { kind: 'image', src: exercise.gif_url } : { kind: 'none' }
    }

    if (exercise.gif_url) return { kind: 'image', src: exercise.gif_url }

    if (url) {
        const lower = url.toLowerCase()
        const isVideo =
            lower.includes('.mp4') ||
            lower.includes('.mov') ||
            lower.includes('.webm') ||
            (lower.includes('supabase.co/storage') &&
                !lower.includes('.gif') &&
                !lower.includes('.jpg') &&
                !lower.includes('.png'))
        return isVideo ? { kind: 'video', src: url } : { kind: 'image', src: url }
    }

    return { kind: 'none' }
}
