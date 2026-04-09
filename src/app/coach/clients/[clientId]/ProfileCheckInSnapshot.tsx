'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Scale, Battery, StickyNote, Camera, ChevronRight } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type CheckInRow = {
    created_at: string
    weight?: number | null
    energy_level?: number | null
    notes?: string | null
    front_photo_url?: string | null
    side_photo_url?: string | null
    back_photo_url?: string | null
}

function EnergyStars({ level }: { level: number | null | undefined }) {
    const stars = Math.min(5, Math.max(0, Math.round((level ?? 0) / 2)))
    return (
        <span className="inline-flex gap-0.5" aria-label={`Energía ${level ?? 0} de 10`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <span
                    key={i}
                    className={cn(
                        'text-sm leading-none',
                        i <= stars ? 'text-amber-400' : 'text-muted-foreground/25'
                    )}
                >
                    ★
                </span>
            ))}
        </span>
    )
}

function MetricRow({
    icon: Icon,
    label,
    children,
}: {
    icon: typeof Scale
    label: string
    children: ReactNode
}) {
    return (
        <div className="flex items-start gap-3 py-2 border-b border-border/40 dark:border-white/5 last:border-0 last:pb-0">
            <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    {label}
                </p>
                <div className="text-sm font-bold text-foreground mt-0.5">{children}</div>
            </div>
        </div>
    )
}

type ProfileCheckInSnapshotProps = {
    checkIn: CheckInRow | null | undefined
    onViewHistory: () => void
}

export function ProfileCheckInSnapshot({ checkIn, onViewHistory }: ProfileCheckInSnapshotProps) {
    const [open, setOpen] = useState(false)
    const photo =
        checkIn?.front_photo_url || checkIn?.side_photo_url || checkIn?.back_photo_url

    if (!checkIn) {
        return (
            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 h-full flex flex-col justify-center">
                <div className="flex items-center gap-2 text-muted-foreground text-sm font-medium">
                    <Camera className="w-4 h-4 shrink-0" />
                    Aún no hay check-ins registrados.
                </div>
                <Button
                    type="button"
                    variant="link"
                    className="mt-2 h-auto p-0 text-[10px] font-black uppercase tracking-widest text-primary justify-start"
                    onClick={onViewHistory}
                >
                    Ver panel de progreso
                    <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
            </GlassCard>
        )
    }

    const relative = formatDistanceToNow(new Date(checkIn.created_at), {
        addSuffix: true,
        locale: es,
    })

    return (
        <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden h-full flex flex-col">
            <div className="absolute top-0 right-0 -mr-12 -mt-12 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
            <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4 relative z-10">
                <Camera className="w-4 h-4" />
                Último check-in
            </h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4 relative z-10">
                {relative}
            </p>

            {photo && (
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger
                        render={
                            <button
                                type="button"
                                className="relative z-10 mb-4 w-full aspect-[4/3] max-h-44 rounded-xl overflow-hidden border border-border/60 bg-secondary/30 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            />
                        }
                    >
                        <Image
                            src={photo}
                            alt="Check-in"
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                            sizes="(max-width: 768px) 100vw, 400px"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent py-2 text-[9px] font-black uppercase tracking-widest text-white text-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            Ampliar
                        </span>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg border-border/60">
                        <DialogHeader>
                            <DialogTitle className="uppercase font-black tracking-tight">
                                Foto del check-in
                            </DialogTitle>
                        </DialogHeader>
                        <div className="relative aspect-[3/4] w-full max-h-[70vh] rounded-lg overflow-hidden bg-black">
                            <Image src={photo} alt="Check-in ampliado" fill className="object-contain" />
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            <div className="relative z-10 flex-1 space-y-0">
                <MetricRow icon={Scale} label="Peso">
                    {checkIn.weight != null ? `${checkIn.weight} kg` : '—'}
                </MetricRow>
                <MetricRow icon={Battery} label="Energía">
                    <EnergyStars level={checkIn.energy_level} />
                </MetricRow>
                <MetricRow icon={StickyNote} label="Notas">
                    {checkIn.notes?.trim() ? (
                        <span className="font-medium text-foreground/90 whitespace-pre-wrap break-words">
                            {checkIn.notes}
                        </span>
                    ) : (
                        <span className="text-muted-foreground font-medium">Sin notas</span>
                    )}
                </MetricRow>
            </div>

            <Button
                type="button"
                variant="ghost"
                className="relative z-10 mt-4 h-auto py-2 px-0 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/90 justify-start gap-1"
                onClick={onViewHistory}
            >
                Ver historial en Progreso
                <ChevronRight className="w-3.5 h-3.5" />
            </Button>
        </GlassCard>
    )
}
