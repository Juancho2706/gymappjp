'use client'

import * as React from 'react'
import { PhotoComparisonSlider } from './PhotoComparisonSlider'
import { GlassCard } from '@/components/ui/glass-card'
import { GlassButton } from '@/components/ui/glass-button'
import { Image as ImageIcon } from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface CheckIn {
    id: string
    created_at: string
    front_photo_url: string | null
}

interface VisualEvolutionProps {
    checkIns: CheckIn[]
    daysActive: number
}

export function VisualEvolution({
    checkIns,
    daysActive
}: VisualEvolutionProps) {
    const [isSliderOpen, setIsSliderOpen] = React.useState(false)

    // Select the first and last check-ins by default
    const [beforeId, setBeforeId] = React.useState<string>(checkIns[0]?.id || '')
    const [afterId, setAfterId] = React.useState<string>(checkIns[checkIns.length - 1]?.id || '')

    const hasPhotos = checkIns.length > 0

    if (!hasPhotos) return null // El padre ya no lo renderizará, pero por seguridad.

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    const beforeCheckIn = checkIns.find(c => c.id === beforeId) || checkIns[0]
    const afterCheckIn = checkIns.find(c => c.id === afterId) || checkIns[checkIns.length - 1]

    const beforePhoto = beforeCheckIn?.front_photo_url || null
    const afterPhoto = afterCheckIn?.front_photo_url || null

    const beforeDateLabel = beforeCheckIn ? formatDate(beforeCheckIn.created_at) : 'Antes'
    const afterDateLabel = afterCheckIn ? formatDate(afterCheckIn.created_at) : 'Después'

    return (
        <div className="space-y-4 md:space-y-6">
            <h2 className="text-[10px] md:text-xs font-black text-foreground uppercase tracking-[0.4em] flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                Evolución Visual
            </h2>
            <GlassCard className="p-4 md:p-6 space-y-4 md:space-y-6">
                <div className="grid grid-cols-2 gap-3 md:gap-4">
                    {/* Before Photo Selector & Image */}
                    <div className="flex flex-col gap-2">
                        <div className="aspect-[3/4] rounded-xl md:rounded-2xl bg-secondary dark:bg-white/5 border border-border dark:border-white/10 flex flex-col items-center justify-center overflow-hidden relative group">
                            {beforePhoto ? (
                                <img 
                                    src={beforePhoto} 
                                    alt="Antes" 
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                            ) : (
                                <ImageIcon className="w-6 h-6 text-muted-foreground/20" />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                <span className="text-[8px] md:text-[10px] font-black text-white uppercase tracking-widest">
                                    {beforePhoto ? 'Ver Antes' : 'Sin Foto'}
                                </span>
                            </div>
                        </div>
                        <Select value={beforeId} onValueChange={(val) => val && setBeforeId(val)}>
                            <SelectTrigger className="h-8 md:h-10 text-[10px] md:text-xs font-bold bg-background/50 border-white/10">
                                <SelectValue placeholder="Seleccionar fecha">
                                    {beforeCheckIn ? formatDate(beforeCheckIn.created_at) : undefined}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {checkIns.map((ci) => (
                                    <SelectItem key={ci.id} value={ci.id} className="text-[10px] md:text-xs">
                                        {formatDate(ci.created_at)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* After Photo Selector & Image */}
                    <div className="flex flex-col gap-2">
                        <div className="aspect-[3/4] rounded-xl md:rounded-2xl bg-secondary dark:bg-white/5 border border-border dark:border-white/10 flex flex-col items-center justify-center overflow-hidden relative group">
                            {afterPhoto ? (
                                <img 
                                    src={afterPhoto} 
                                    alt="Después" 
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                            ) : (
                                <ImageIcon className="w-6 h-6 text-muted-foreground/20" />
                            )}
                            <div className="absolute inset-0 bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                                <span className="text-[8px] md:text-[10px] font-black text-white uppercase tracking-widest">
                                    {afterPhoto ? 'Ver Después' : 'Sin Foto'}
                                </span>
                            </div>
                        </div>
                        <Select value={afterId} onValueChange={(val) => val && setAfterId(val)}>
                            <SelectTrigger className="h-8 md:h-10 text-[10px] md:text-xs font-bold bg-background/50 border-white/10">
                                <SelectValue placeholder="Seleccionar fecha">
                                    {afterCheckIn ? formatDate(afterCheckIn.created_at) : undefined}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {checkIns.map((ci) => (
                                    <SelectItem key={ci.id} value={ci.id} className="text-[10px] md:text-xs">
                                        {formatDate(ci.created_at)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <GlassButton 
                    onClick={() => setIsSliderOpen(true)}
                    disabled={!beforePhoto || !afterPhoto}
                    className="w-full h-10 md:h-12 text-[8px] md:text-[10px] font-black uppercase tracking-widest border-primary/20 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                    Comparativa de Fotos
                </GlassButton>
            </GlassCard>

            {beforePhoto && afterPhoto && (
                <PhotoComparisonSlider
                    isOpen={isSliderOpen}
                    onClose={() => setIsSliderOpen(false)}
                    beforePhoto={beforePhoto}
                    afterPhoto={afterPhoto}
                    beforeDate={beforeDateLabel}
                    afterDate={afterDateLabel}
                />
            )}
        </div>
    )
}
