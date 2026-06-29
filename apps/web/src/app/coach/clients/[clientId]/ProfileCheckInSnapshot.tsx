'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Image from 'next/image'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Scale, Battery, StickyNote, Camera, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { markCheckInReviewed } from './_actions/client-detail.actions'

type CheckInRow = {
    id?: string
    created_at: string
    weight?: number | null
    energy_level?: number | null
    notes?: string | null
    reviewed_at?: string | null
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
                        i <= stars ? 'text-[var(--ember-500)]' : 'text-[var(--ink-200)]'
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
        <div className="flex items-start gap-3 border-b border-subtle py-2 last:border-0 last:pb-0">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sport-600" />
            <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted">
                    {label}
                </p>
                <div className="mt-0.5 text-sm font-bold text-strong">{children}</div>
            </div>
        </div>
    )
}

type ProfileCheckInSnapshotProps = {
    checkIn: CheckInRow | null | undefined
    clientId: string
    onViewHistory: () => void
}

export function ProfileCheckInSnapshot({ checkIn, clientId, onViewHistory }: ProfileCheckInSnapshotProps) {
    const [open, setOpen] = useState(false)
    const [reviewed, setReviewed] = useState(Boolean(checkIn?.reviewed_at))
    const [pending, startTransition] = useTransition()
    const photo =
        checkIn?.front_photo_url || checkIn?.side_photo_url || checkIn?.back_photo_url

    function handleMarkReviewed() {
        if (!checkIn?.id) return
        startTransition(async () => {
            try {
                await markCheckInReviewed(clientId, checkIn.id!)
                setReviewed(true)
            } catch { /* swallow — UI stays unreviewed */ }
        })
    }

    if (!checkIn) {
        return (
            <Card padding="md" className="h-full justify-center">
                <div className="flex items-center gap-2 text-sm font-medium text-muted">
                    <Camera className="h-4 w-4 shrink-0" />
                    Aún no hay check-ins registrados.
                </div>
                <Button
                    type="button"
                    variant="link"
                    className="mt-2 h-auto justify-start p-0 text-[10px] font-black uppercase tracking-widest text-sport-600"
                    onClick={onViewHistory}
                >
                    Ver panel de progreso
                    <ChevronRight className="ml-1 h-3 w-3" />
                </Button>
            </Card>
        )
    }

    const relative = formatDistanceToNow(new Date(checkIn.created_at), {
        addSuffix: true,
        locale: es,
    })

    return (
        <Card padding="md" className="h-full gap-0">
            <h3 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sport-600">
                <Camera className="h-4 w-4" />
                Último check-in
            </h3>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted">
                {relative}
            </p>

            {photo && (
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger
                        render={
                            <button
                                type="button"
                                className="group relative z-10 mb-4 aspect-[4/3] max-h-44 w-full overflow-hidden rounded-control border border-subtle bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
                            <Image src={photo} alt="Check-in ampliado" fill sizes="(max-width: 768px) 100vw, 600px" className="object-contain" />
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
                        <span className="font-medium whitespace-pre-wrap break-words text-body">
                            {checkIn.notes}
                        </span>
                    ) : (
                        <span className="font-medium text-muted">Sin notas</span>
                    )}
                </MetricRow>
            </div>

            {/* Mark reviewed — enterprise response-time tracking */}
            {checkIn.id && (
                reviewed ? (
                    <div className="mt-4 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--success-600)]">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Revisado
                    </div>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        className="mt-4 h-auto gap-1.5 py-2 text-[10px] font-black uppercase tracking-widest"
                        onClick={handleMarkReviewed}
                        disabled={pending}
                    >
                        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        Marcar como revisado
                    </Button>
                )
            )}

            <Button
                type="button"
                variant="ghost"
                className="mt-2 h-auto justify-start gap-1 px-0 py-2 text-[10px] font-black uppercase tracking-widest text-sport-600 hover:text-sport-700"
                onClick={onViewHistory}
            >
                Ver historial en Progreso
                <ChevronRight className="h-3.5 w-3.5" />
            </Button>
        </Card>
    )
}
