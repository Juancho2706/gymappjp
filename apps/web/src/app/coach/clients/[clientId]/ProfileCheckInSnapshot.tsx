'use client'

import { useState, useSyncExternalStore, useTransition, type ReactNode } from 'react'
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
} from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { markCheckInReviewed } from './_actions/client-detail.actions'
import { SectionTitle } from './_components/SectionTitle'

function subscribeMd(cb: () => void) {
    const mq = window.matchMedia('(min-width: 768px)')
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
}

/** matchMedia md-up (mismo patrón que AssignModal): desktop → Dialog, móvil → bottom-sheet. */
function useIsDesktopMd() {
    return useSyncExternalStore(
        subscribeMd,
        () => window.matchMedia('(min-width: 768px)').matches,
        () => true
    )
}

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
    const isDesktop = useIsDesktopMd()
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

    // h-full/flex-1 SOLO desktop (empareja columnas del grid); en móvil la card es de alto natural
    // — antes el espaciador flex crecía y dejaba un hueco gigante entre Notas y los botones.
    return (
        <Card padding="md" className="gap-0 md:h-full">
            <SectionTitle style={{ marginTop: 0 }}>Último check-in</SectionTitle>
            <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-muted">
                {relative}
            </p>

            {photo && (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="group relative z-10 mb-4 aspect-[4/3] max-h-44 w-full overflow-hidden rounded-control border border-subtle bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
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
                    </button>
                    {isDesktop ? (
                        <Dialog open={open} onOpenChange={setOpen}>
                            <DialogContent className="max-w-lg border-subtle bg-surface-card">
                                <DialogHeader>
                                    <DialogTitle className="font-display text-lg font-extrabold normal-case tracking-[-0.02em] text-strong">
                                        Foto del check-in
                                    </DialogTitle>
                                </DialogHeader>
                                <div className="relative aspect-[3/4] w-full max-h-[70vh] rounded-control overflow-hidden bg-black">
                                    <Image src={photo} alt="Check-in ampliado" fill sizes="(max-width: 768px) 100vw, 600px" className="object-contain" />
                                </div>
                            </DialogContent>
                        </Dialog>
                    ) : (
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetContent
                                side="bottom"
                                showCloseButton={false}
                                className="max-h-[min(88dvh,88svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body"
                            >
                                <div className="flex max-h-[min(88dvh,88svh)] flex-col overflow-y-auto overscroll-contain px-[max(1.25rem,env(safe-area-inset-left))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-3">
                                    <div className="mx-auto mb-3 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
                                    <SheetHeader className="border-0 bg-transparent p-0 pb-3">
                                        <SheetTitle className="font-display text-lg font-extrabold normal-case tracking-[-0.02em] text-strong">
                                            Foto del check-in
                                        </SheetTitle>
                                    </SheetHeader>
                                    <div className="relative aspect-[3/4] w-full max-h-[70dvh] rounded-control overflow-hidden bg-black">
                                        <Image src={photo} alt="Check-in ampliado" fill sizes="100vw" className="object-contain" />
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    )}
                </>
            )}

            <div className="relative z-10 space-y-0 md:flex-1">
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
