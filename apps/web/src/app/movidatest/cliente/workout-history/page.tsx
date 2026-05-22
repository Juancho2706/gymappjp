'use client'

import { Trophy, Clock, Flame, TrendingUp } from 'lucide-react'
import { mariaWorkoutHistory, MOVIDA_BRAND } from '../../_mock'

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
}

function formatDuration(minutes: number) {
    return `${minutes} min`
}

export default function WorkoutHistoryPage() {
    const total = mariaWorkoutHistory.length
    const avgDuration = Math.round(mariaWorkoutHistory.reduce((s, w) => s + w.duration_minutes, 0) / total)
    const totalVolume = mariaWorkoutHistory.reduce((s, w) => s + w.total_volume_kg, 0)

    return (
        <div className="pb-4">
            {/* Header */}
            <div className="px-4 py-3 border-b border-border bg-card">
                <h1 className="text-sm font-bold">Historial de entrenos</h1>
                <p className="text-[11px] text-muted-foreground">Últimas 12 semanas</p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2 mx-4 mt-3">
                {[
                    { label: 'Sesiones', value: total, icon: Trophy, color: '#F59E0B' },
                    { label: 'Duración prom.', value: `${avgDuration}m`, icon: Clock, color: MOVIDA_BRAND.primaryColor },
                    { label: 'Volumen total', value: `${(totalVolume / 1000).toFixed(1)}t`, icon: TrendingUp, color: '#3B82F6' },
                ].map(s => (
                    <div key={s.label} className="rounded-xl border border-border bg-card p-3 text-center">
                        <s.icon className="w-4 h-4 mx-auto mb-1" style={{ color: s.color }} />
                        <p className="text-base font-bold">{s.value}</p>
                        <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Session list */}
            <div className="px-4 mt-4 space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sesiones recientes</h2>
                {mariaWorkoutHistory.map((session, idx) => (
                    <div key={session.id} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-3">
                                <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-xs font-bold"
                                    style={{ backgroundColor: idx === 0 ? MOVIDA_BRAND.primaryColor : `${MOVIDA_BRAND.primaryColor}40` }}
                                >
                                    {idx === 0 ? <Trophy className="w-4 h-4" /> : total - idx}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold">{session.plan_name}</p>
                                    <p className="text-[11px] text-muted-foreground">{formatDate(session.completed_at)}</p>
                                    <div className="flex gap-3 mt-1">
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                            <Clock className="w-3 h-3" />
                                            {formatDuration(session.duration_minutes)}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                            <Flame className="w-3 h-3 text-orange-400" />
                                            {session.sets_count} sets
                                        </span>
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                            <TrendingUp className="w-3 h-3" style={{ color: MOVIDA_BRAND.primaryColor }} />
                                            {session.total_volume_kg.toLocaleString('es-CL')} kg
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {idx === 0 && (
                                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold text-white" style={{ backgroundColor: MOVIDA_BRAND.primaryColor }}>
                                    Última
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
