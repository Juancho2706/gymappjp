'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Share2,
    ChevronRight,
    Dumbbell,
    Flame,
    History,
    LogOut,
    Trash2,
    CircleHelp,
    PersonStanding,
    Gauge,
    Volume2,
    TrendingUp,
    CalendarDays,
    type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { playTimerSound, type TimerSound } from '@/lib/audioUtils'
import { SectionTitle } from '../../dashboard/_components/shared/SectionTitle'
import { SALES_EMAIL } from '@/lib/brand-assets'
import { ProgressShareCardModal } from './ProgressShareCardModal'
import { StreakShareCardModal } from './StreakShareCardModal'
import { MonthlySummaryShareCardModal } from './MonthlySummaryShareCardModal'

const REST_SOUND_LABELS: Record<TimerSound, string> = {
    digital: 'Digital (Beep)',
    bell: 'Campana',
    classic: 'Clásico',
    boxing: 'Boxeo',
}

interface Props {
    coachSlug: string
    base: string
    fullName: string
    brandName: string
    programName: string | null
    streak: number
    totalWorkouts: number
    showMovement: boolean
    showBodyComposition: boolean
    monthlyRecap: { sessions: number; volumeKg: number; monthLabel: string }
}

/** Plantillas de share-card que el alumno puede compartir desde el perfil. */
type ShareTemplate = 'progress' | 'streak' | 'monthly'

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'A'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

function StatCard({
    label,
    value,
    unit,
    icon: Icon,
    accent,
}: {
    label: string
    value: string | number
    unit?: string
    icon: LucideIcon
    accent: string
}) {
    return (
        <div className="rounded-card border border-border-subtle bg-surface-card p-4">
            <span
                className="mb-2.5 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)]"
                style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
            >
                <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="flex items-baseline gap-1">
                <span className="font-display text-2xl font-black leading-none text-text-strong">{value}</span>
                {unit && <span className="text-xs font-bold text-text-muted">{unit}</span>}
            </div>
            <div className="mt-1 text-[12.5px] font-semibold text-text-muted">{label}</div>
        </div>
    )
}

/** Fila de lista tappable (espejo del DS `ListRow`). */
function Row({
    leadingIcon: Icon,
    leadingClass,
    title,
    subtitle,
    trailing,
    href,
    onClick,
}: {
    leadingIcon: LucideIcon
    leadingClass?: string
    title: string
    subtitle?: string
    trailing?: React.ReactNode
    href?: string
    onClick?: () => void
}) {
    const inner = (
        <>
            <span
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] ${leadingClass ?? 'bg-surface-sunken text-[var(--ink-700)]'}`}
            >
                <Icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1 text-left">
                <div className="truncate text-[14.5px] font-bold text-text-strong">{title}</div>
                {subtitle && <div className="truncate text-[12.5px] text-text-muted">{subtitle}</div>}
            </div>
            {trailing}
            <ChevronRight className="h-[18px] w-[18px] flex-shrink-0 text-[var(--ink-300)]" />
        </>
    )
    const cls = 'flex min-h-[52px] w-full items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-surface-sunken'
    if (href) {
        const external = href.startsWith('mailto:')
        if (external) {
            return (
                <a href={href} className={cls}>
                    {inner}
                </a>
            )
        }
        return (
            <Link href={href} className={cls}>
                {inner}
            </Link>
        )
    }
    return (
        <button type="button" onClick={onClick} className={cls}>
            {inner}
        </button>
    )
}

/** Opción del selector de share-cards: icono con acento, título, subtítulo y chevron (EVA DS). */
function ShareTemplateOption({
    icon: Icon,
    title,
    subtitle,
    accentBg,
    accentIconBg,
    accentIconColor,
    onSelect,
}: {
    icon: LucideIcon
    title: string
    subtitle: string
    accentBg: string
    accentIconBg: string
    accentIconColor: string
    onSelect: () => void
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className="flex w-full items-center gap-3.5 rounded-card p-3.5 text-left transition-transform active:scale-[0.99]"
            style={{ background: accentBg, border: '1px solid var(--border-subtle)' }}
        >
            <span
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                style={{ background: accentIconBg, color: accentIconColor }}
            >
                <Icon className="h-[20px] w-[20px]" />
            </span>
            <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-extrabold text-text-strong">{title}</div>
                <div className="text-[12.5px] text-text-muted">{subtitle}</div>
            </div>
            <ChevronRight className="h-[18px] w-[18px] flex-shrink-0 text-[var(--ink-300)]" />
        </button>
    )
}

export function ProfileClient({
    base,
    fullName,
    brandName,
    programName,
    streak,
    totalWorkouts,
    showMovement,
    showBodyComposition,
    monthlyRecap,
}: Props) {
    const router = useRouter()
    // Alarma de descanso (sonido del timer de rutina) — preferencia local (localStorage), movida
    // acá desde el viejo engranaje del dashboard. El volumen se mantiene (default 1.0) para la
    // preview; solo se expone el tipo de sonido, igual que el modal anterior.
    const [restSound, setRestSound] = useState<TimerSound>('digital')
    // Selector de plantilla de share-card (Progreso / Racha / Resumen mensual) + modal activo.
    const [pickerOpen, setPickerOpen] = useState(false)
    const [activeShare, setActiveShare] = useState<ShareTemplate | null>(null)

    const hasModules = showMovement || showBodyComposition

    function pickShare(template: ShareTemplate) {
        setPickerOpen(false)
        setActiveShare(template)
    }

    useEffect(() => {
        const saved = localStorage.getItem('restTimerSound') as TimerSound | null
        if (saved && saved in REST_SOUND_LABELS) setRestSound(saved)
    }, [])

    function handleRestSoundChange(next: TimerSound) {
        setRestSound(next)
        localStorage.setItem('restTimerSound', next)
        const savedVolume = localStorage.getItem('restTimerVolume')
        playTimerSound(next, savedVolume ? parseFloat(savedVolume) : 1.0) // preview
    }

    async function handleSignOut() {
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push(`${base}/login`)
        router.refresh()
    }

    return (
        <div className="mx-auto w-full max-w-2xl px-5 pb-8 pt-safe">
            <header className="flex items-center py-4">
                <h1 className="font-display text-[22px] font-black tracking-[-0.02em] text-text-strong">Mi perfil</h1>
            </header>

            {/* Hero de identidad (Card inverse) */}
            <div
                className="mb-4 flex items-center gap-4 rounded-card p-5"
                style={{ background: 'var(--surface-inverse)' }}
            >
                <span
                    className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full font-display text-xl font-black"
                    style={{ background: 'var(--sport-100)', color: 'var(--sport-600)', boxShadow: '0 0 0 2.5px var(--sport-500)' }}
                >
                    {initials(fullName)}
                </span>
                <div className="min-w-0">
                    <div className="truncate font-display text-[22px] font-black text-on-dark">{fullName}</div>
                    <div className="mt-0.5 truncate text-[13px] text-on-dark-muted">Coach: {brandName}</div>
                    {programName && (
                        <span
                            className="mt-2 inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-white"
                            style={{ background: 'var(--sport-500)' }}
                        >
                            {programName}
                        </span>
                    )}
                </div>
            </div>

            {/* Stats */}
            <div className="mb-4 grid grid-cols-2 gap-3">
                <StatCard label="Entrenos" value={totalWorkouts} icon={Dumbbell} accent="var(--sport-500)" />
                <StatCard label="Racha" value={streak} unit="días" icon={Flame} accent="var(--ember-500)" />
            </div>

            {/* Compartí tu logro — abre el selector de plantilla */}
            <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="mb-4 flex w-full items-center gap-3.5 rounded-card p-4 text-left transition-transform active:scale-[0.99]"
                style={{ background: 'var(--sport-100)', border: '1px solid var(--sport-200)' }}
            >
                <span
                    className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] text-white"
                    style={{ background: 'var(--sport-500)', boxShadow: 'var(--glow-sport)' }}
                >
                    <Share2 className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-extrabold text-text-strong">Compartí tu logro</div>
                    <div className="text-[12.5px] text-text-muted">Elegí una tarjeta con la marca de tu coach</div>
                </div>
                <ChevronRight className="h-[18px] w-[18px] flex-shrink-0" style={{ color: 'var(--sport-600)' }} />
            </button>

            {/* Apariencia */}
            <SectionTitle>Apariencia</SectionTitle>
            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-card">
                <div className="flex min-h-[52px] items-center justify-between px-3.5 py-2.5">
                    <span className="text-sm font-semibold text-body">Tema</span>
                    <ThemeToggle />
                </div>
            </div>

            {/* Preferencias — Alarma de descanso (sonido del timer de rutina) */}
            <SectionTitle>Preferencias</SectionTitle>
            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-card">
                <div className="flex min-h-[52px] items-center justify-between gap-3 px-3.5 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-body">
                        <Volume2 className="h-4 w-4 flex-shrink-0 text-text-muted" />
                        <span className="truncate">Alarma de descanso</span>
                    </span>
                    <Select value={restSound} onValueChange={(v) => handleRestSoundChange(v as TimerSound)}>
                        <SelectTrigger className="h-10 w-[9.5rem] rounded-control" aria-label="Sonido de la alarma de descanso">
                            <SelectValue>{REST_SOUND_LABELS[restSound]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(REST_SOUND_LABELS) as TimerSound[]).map((key) => (
                                <SelectItem key={key} value={key}>
                                    {REST_SOUND_LABELS[key]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Módulos (read-only, solo los que el coach habilitó) */}
            {hasModules && (
                <>
                    <SectionTitle>Módulos</SectionTitle>
                    <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-card">
                        {showMovement && (
                            <Row
                                leadingIcon={PersonStanding}
                                leadingClass="bg-[var(--sport-100)] text-[var(--sport-600)]"
                                title="Movimiento"
                                subtitle="Screening · solo lectura"
                                href={`${base}/movimiento`}
                                trailing={
                                    <span
                                        className="rounded-pill px-2 py-0.5 text-[11px] font-bold"
                                        style={{ background: 'var(--sport-100)', color: 'var(--sport-600)' }}
                                    >
                                        Ver
                                    </span>
                                }
                            />
                        )}
                        {showMovement && showBodyComposition && <div className="mx-3.5 h-px bg-border-subtle" />}
                        {showBodyComposition && (
                            <Row
                                leadingIcon={Gauge}
                                leadingClass="bg-[var(--success-100)] text-[var(--success-700)]"
                                title="Composición"
                                subtitle="BIA / ISAK · solo lectura"
                                href={`${base}/bodycomp`}
                                trailing={
                                    <span
                                        className="rounded-pill px-2 py-0.5 text-[11px] font-bold"
                                        style={{ background: 'var(--success-100)', color: 'var(--success-700)' }}
                                    >
                                        Ver
                                    </span>
                                }
                            />
                        )}
                    </div>
                </>
            )}

            {/* Cuenta */}
            <SectionTitle>Cuenta</SectionTitle>
            <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-card">
                <Row leadingIcon={History} title="Historial de entrenos" href={`${base}/workout-history`} />
                <div className="mx-3.5 h-px bg-border-subtle" />
                <Row leadingIcon={CircleHelp} title="Ayuda" href={`mailto:${SALES_EMAIL}?subject=Ayuda`} />
                <div className="mx-3.5 h-px bg-border-subtle" />
                <Row leadingIcon={LogOut} title="Cerrar sesión" onClick={handleSignOut} />
            </div>

            {/* Zona de peligro */}
            <div className="mt-5">
                <div className="mx-1 mb-2 text-[11px] font-extrabold uppercase tracking-[0.07em]" style={{ color: 'var(--danger-600)' }}>
                    Zona de peligro
                </div>
                <a
                    href="mailto:privacidad@eva-app.cl?subject=Solicitud%20de%20baja%20de%20cuenta"
                    className="flex items-center gap-3.5 rounded-card bg-surface-card p-4 transition-colors hover:bg-surface-sunken"
                    style={{ border: '1.5px solid var(--danger-100)' }}
                >
                    <span
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                        style={{ background: 'var(--danger-100)', color: 'var(--danger-600)' }}
                    >
                        <Trash2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="text-[14.5px] font-bold text-text-strong">Solicitar baja de cuenta</div>
                        <div className="text-[12.5px] text-text-muted">Pedí la eliminación de tus datos (derechos ARCO)</div>
                    </div>
                    <ChevronRight className="h-[18px] w-[18px] flex-shrink-0 text-[var(--ink-300)]" />
                </a>
            </div>

            <p className="mt-6 text-center text-[10px] text-text-muted">v1.2.0 · Hecho con ❤️ para tu progreso</p>

            {/* Selector de plantilla — sheet EVA DS (no un dropdown pelado) */}
            <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
                <SheetContent side="bottom" className="max-h-[88dvh] sm:max-w-md" data-side="bottom">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <Share2 className="h-[18px] w-[18px] shrink-0 text-sport-500" />
                            Compartí tu logro
                        </SheetTitle>
                    </SheetHeader>
                    <div className="flex flex-col gap-2.5 px-5 pb-5 pt-1">
                        <p className="mb-1 text-[12.5px] text-text-muted">
                            Cada tarjeta lleva la marca de tu coach. Elegí cuál compartir:
                        </p>
                        <ShareTemplateOption
                            icon={TrendingUp}
                            title="Progreso"
                            subtitle="Tus entrenos totales y tu racha"
                            accentBg="var(--sport-100)"
                            accentIconBg="var(--sport-500)"
                            accentIconColor="#ffffff"
                            onSelect={() => pickShare('progress')}
                        />
                        <ShareTemplateOption
                            icon={Flame}
                            title="Racha"
                            subtitle={streak > 0 ? `${streak} ${streak === 1 ? 'día' : 'días'} seguidos activo` : 'Encendé tu racha'}
                            accentBg="var(--ember-100, color-mix(in oklab, var(--ember-500) 12%, transparent))"
                            accentIconBg="var(--ember-500)"
                            accentIconColor="#ffffff"
                            onSelect={() => pickShare('streak')}
                        />
                        <ShareTemplateOption
                            icon={CalendarDays}
                            title="Resumen mensual"
                            subtitle={`${monthlyRecap.monthLabel} · sesiones y volumen`}
                            accentBg="var(--surface-sunken)"
                            accentIconBg="var(--surface-card)"
                            accentIconColor="var(--sport-600)"
                            onSelect={() => pickShare('monthly')}
                        />
                    </div>
                </SheetContent>
            </Sheet>

            {activeShare === 'progress' && (
                <ProgressShareCardModal
                    data={{ fullName, totalWorkouts, streak, programName }}
                    onClose={() => setActiveShare(null)}
                />
            )}
            {activeShare === 'streak' && (
                <StreakShareCardModal data={{ fullName, streak, brandName }} onClose={() => setActiveShare(null)} />
            )}
            {activeShare === 'monthly' && (
                <MonthlySummaryShareCardModal
                    data={{
                        fullName,
                        monthLabel: monthlyRecap.monthLabel,
                        sessions: monthlyRecap.sessions,
                        volumeKg: monthlyRecap.volumeKg,
                        streak,
                        brandName,
                    }}
                    onClose={() => setActiveShare(null)}
                />
            )}
        </div>
    )
}
