'use client'

import { Calendar, Image as ImageIcon, MessageSquare, Activity, Weight } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'

interface CheckInProps {
    date: string
    weight: number | null
    energyLevel: number | null
    notes?: string | null
    photoUrl?: string | null
}

export function CheckInCard({ date, weight, energyLevel, notes, photoUrl }: CheckInProps) {
    const [isPhotoOpen, setIsPhotoOpen] = useState(false)

    const formattedDate = new Date(date).toLocaleDateString('es-AR', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    })

    return (
        <div className="bg-surface-card border border-subtle rounded-card p-5 hover:border-[color:var(--sport-500)]/30 transition-colors shadow-[var(--shadow-sm)]">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2 text-muted">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm font-medium capitalize">{formattedDate}</span>
                </div>
                {photoUrl && (
                    <button
                        onClick={() => setIsPhotoOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-surface-sunken hover:bg-surface-card text-xs font-medium text-strong transition-colors"
                    >
                        <ImageIcon className="w-3.5 h-3.5" />
                        Ver Foto
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-surface-sunken border border-subtle rounded-control p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-control bg-sport-500/10 text-sport-600 flex items-center justify-center">
                        <Weight className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-xs text-muted font-medium tracking-wide uppercase">Peso</p>
                        <p className="text-sm font-bold text-strong">{weight !== null ? `${weight} kg` : '--'}</p>
                    </div>
                </div>

                <div className="bg-surface-sunken border border-subtle rounded-control p-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-control bg-[var(--warning-100)] text-[var(--warning-700)] flex items-center justify-center">
                        <Activity className="w-4 h-4" />
                    </div>
                    <div>
                        <p className="text-xs text-muted font-medium tracking-wide uppercase">Energía</p>
                        <p className="text-sm font-bold text-strong">{energyLevel !== null ? `${energyLevel}/10` : '--'}</p>
                    </div>
                </div>
            </div>

            {notes && (
                <div className="bg-surface-sunken rounded-control p-3.5 border border-subtle">
                    <div className="flex items-center gap-2 mb-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-muted" />
                        <span className="text-xs font-bold text-muted uppercase tracking-wider">Notas</span>
                    </div>
                    <p className="text-sm text-body leading-relaxed break-words">{notes}</p>
                </div>
            )}

            {/* Photo Modal */}
            {isPhotoOpen && photoUrl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-overlay)] p-4" onClick={() => setIsPhotoOpen(false)}>
                    <div className="relative w-full max-w-lg aspect-[3/4] max-h-[90vh] rounded-card overflow-hidden bg-surface-card border border-subtle shadow-[var(--shadow-lg)]" onClick={e => e.stopPropagation()}>
                        <Image src={photoUrl} alt={`Foto progreso ${formattedDate}`} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
                        <button
                            onClick={() => setIsPhotoOpen(false)}
                            className="absolute top-4 right-4 w-10 h-10 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black border border-white/10 backdrop-blur-sm transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
