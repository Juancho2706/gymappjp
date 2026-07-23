'use client'

import { Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'

interface ExecMediaControlsProps {
    /** Silencio actual del video (default true en los llamadores). */
    muted: boolean
    onToggleMute: () => void
    /** Video en pausa (el usuario lo detuvo). */
    paused: boolean
    onTogglePause: () => void
    /** Vuelve el video al inicio (currentTime = 0 / seekTo 0) y reanuda. */
    onRestart: () => void
}

/**
 * Ejecutor V3 (QA5) — fila de controles glass de la MEDIA de video (kind 'video' directo o 'youtube'
 * inline). Antes sólo había un botón de audio; ahora la esquina inferior-derecha lleva una fila de TRES
 * botones chicos (gap 6) con el MISMO lenguaje glass de los chips: audio (mute/unmute), pausa/reanudar
 * y reiniciar. Compartido por `ExecMediaCard` (fuerza/superserie), `ExecTypedMedia` (movilidad/roller/
 * cardio) y `ExecYoutubeInline` (youtube). Sólo se monta cuando la media ES video/youtube (gif/imagen
 * no llevan controles). Sólo presentación bajo `[data-exec-v3]`; no toca guardado.
 */
export function ExecMediaControls({ muted, onToggleMute, paused, onTogglePause, onRestart }: ExecMediaControlsProps) {
    return (
        <div className="exec-v3-mediactl">
            <button
                type="button"
                onClick={onToggleMute}
                className="exec-v3-mctlbtn"
                aria-label={muted ? 'Activar el sonido del video' : 'Silenciar el video'}
                aria-pressed={!muted}
            >
                {muted ? <VolumeX className="h-3.5 w-3.5" aria-hidden /> : <Volume2 className="h-3.5 w-3.5" aria-hidden />}
            </button>
            <button
                type="button"
                onClick={onTogglePause}
                className="exec-v3-mctlbtn"
                aria-label={paused ? 'Reanudar el video' : 'Pausar el video'}
                aria-pressed={paused}
            >
                {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            </button>
            <button
                type="button"
                onClick={onRestart}
                className="exec-v3-mctlbtn"
                aria-label="Reiniciar el video"
            >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </button>
        </div>
    )
}
