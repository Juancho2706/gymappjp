'use client'

import { useEffect, useState } from 'react'
import { X, Play, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WelcomeModalProps {
    brandName: string
    welcomeModalEnabled: boolean
    welcomeModalContent: string | null
    welcomeModalType: string
    welcomeModalVersion: number
}

const STORAGE_KEY = 'eva:welcome-dismissed-version'

function extractYouTubeId(url: string): string | null {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/)
    return match ? match[1] : null
}

function extractVimeoId(url: string): string | null {
    const match = url.match(/vimeo\.com\/(\d+)/)
    return match ? match[1] : null
}

export function WelcomeModal({
    brandName,
    welcomeModalEnabled,
    welcomeModalContent,
    welcomeModalType,
    welcomeModalVersion,
}: WelcomeModalProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [dontShowAgain, setDontShowAgain] = useState(false)
    const [isMuted, setIsMuted] = useState(true)

    useEffect(() => {
        if (!welcomeModalEnabled || !welcomeModalContent?.trim()) return

        try {
            const dismissedVersion = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10)
            if (dismissedVersion < welcomeModalVersion) {
                // Pequeño delay para que el dashboard termine de cargar visualmente
                const timer = setTimeout(() => setIsOpen(true), 800)
                return () => clearTimeout(timer)
            }
        } catch {
            // localStorage no disponible
        }
    }, [welcomeModalEnabled, welcomeModalContent, welcomeModalVersion])

    const handleClose = () => {
        setIsOpen(false)
    }

    const handleDontShowAgain = () => {
        try {
            localStorage.setItem(STORAGE_KEY, String(welcomeModalVersion))
        } catch {
            // ignore
        }
        setIsOpen(false)
    }

    if (!isOpen) return null

    const videoId = welcomeModalType === 'video' && welcomeModalContent
        ? extractYouTubeId(welcomeModalContent) || extractVimeoId(welcomeModalContent)
        : null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleClose}
            />
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="text-sm font-bold text-foreground">
                        Mensaje de {brandName}
                    </h3>
                    <button
                        onClick={handleClose}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Cerrar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="px-5 py-4 space-y-4">
                    {welcomeModalType === 'video' && videoId ? (
                        <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
                            {welcomeModalContent?.includes('youtube') || welcomeModalContent?.includes('youtu.be') ? (
                                <iframe
                                    key={`yt-${videoId}-${isMuted ? 'muted' : 'unmuted'}`}
                                    src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&showinfo=0&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3`}
                                    title="Video de bienvenida"
                                    className="w-full h-full"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                />
                            ) : (
                                <iframe
                                    key={`vimeo-${videoId}-${isMuted ? 'muted' : 'unmuted'}`}
                                    src={`https://player.vimeo.com/video/${videoId}?autoplay=1&muted=${isMuted ? 1 : 0}&controls=0&title=0&byline=0&portrait=0`}
                                    title="Video de bienvenida"
                                    className="w-full h-full"
                                    allow="autoplay; fullscreen; picture-in-picture"
                                />
                            )}
                            <button
                                onClick={() => setIsMuted((m) => !m)}
                                className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
                                aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
                            >
                                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                {isMuted ? 'Silenciado' : 'Sonido'}
                            </button>
                        </div>
                    ) : welcomeModalType === 'video' ? (
                        <div className="aspect-video rounded-xl bg-muted flex flex-col items-center justify-center gap-2 text-muted-foreground">
                            <Play className="w-8 h-8" />
                            <p className="text-xs">URL de video no válida</p>
                        </div>
                    ) : null}

                    {welcomeModalType === 'text' && welcomeModalContent && (
                        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                            {welcomeModalContent}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 border-t border-border bg-muted/30 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(e) => setDontShowAgain(e.target.checked)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-xs text-muted-foreground">
                            No mostrar de nuevo hasta que haya un mensaje nuevo
                        </span>
                    </label>
                    <button
                        onClick={dontShowAgain ? handleDontShowAgain : handleClose}
                        className="w-full h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    )
}
