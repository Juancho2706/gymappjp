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
    Palette,
    Volume2,
    type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toggleClientBrandColors } from '@/app/c/[coach_slug]/_actions/client-root.actions'
import { playTimerSound, type TimerSound } from '@/lib/audioUtils'
import { SectionTitle } from '../../dashboard/_components/shared/SectionTitle'
import { SALES_EMAIL } from '@/lib/brand-assets'

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
    initialUseBrandColors: boolean
    showBrandColorsToggle: boolean
}

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

export function ProfileClient({
    coachSlug,
    base,
    fullName,
    brandName,
    programName,
    streak,
    totalWorkouts,
    showMovement,
    showBodyComposition,
    initialUseBrandColors,
    showBrandColorsToggle,
}: Props) {
    const router = useRouter()
    const [useBrandColors, setUseBrandColors] = useState(initialUseBrandColors)
    const [isTogglingColors, setIsTogglingColors] = useState(false)
    // Alarma de descanso (sonido del timer de rutina) — preferencia local (localStorage), movida
    // acá desde el viejo engranaje del dashboard. El volumen se mantiene (default 1.0) para la
    // preview; solo se expone el tipo de sonido, igual que el modal anterior.
    const [restSound, setRestSound] = useState<TimerSound>('digital')

    const hasModules = showMovement || showBodyComposition

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

    async function handleShare() {
        const parts = [`Entreno con ${brandName}`]
        if (totalWorkouts > 0) parts.push(`${totalWorkouts} ${totalWorkouts === 1 ? 'entreno' : 'entrenos'} registrados`)
        if (streak > 0) parts.push(`racha de ${streak} ${streak === 1 ? 'día' : 'días'}`)
        const text = parts.join(' · ') + ' 💪'
        try {
            if (typeof navigator !== 'undefined' && navigator.share) {
                await navigator.share({ title: brandName, text })
            } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(text)
                toast.success('Copiado — pegalo en tus redes')
            } else {
                toast.info(text)
            }
        } catch {
            /* usuario canceló el share nativo — no-op */
        }
    }

    async function handleToggleBrandColors(newValue: boolean) {
        setIsTogglingColors(true)
        setUseBrandColors(newValue)
        try {
            const res = await toggleClientBrandColors(newValue, coachSlug)
            if (res.error) {
                setUseBrandColors(!newValue)
                toast.error('Error al guardar preferencia')
            } else {
                toast.success(newValue ? 'Colores del coach activados' : 'Colores por defecto activados')
                router.refresh()
            }
        } catch {
            setUseBrandColors(!newValue)
            toast.error('Error de red')
        } finally {
            setIsTogglingColors(false)
        }
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

            {/* Compartí tu logro */}
            <button
                type="button"
                onClick={handleShare}
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
                    <div className="text-[12.5px] text-text-muted">Contá tu progreso con la marca de tu coach</div>
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
                {showBrandColorsToggle && (
                    <>
                        <div className="mx-3.5 h-px bg-border-subtle" />
                        <div className="flex min-h-[52px] items-center justify-between gap-3 px-3.5 py-2.5">
                            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-body">
                                <Palette className="h-4 w-4 flex-shrink-0 text-text-muted" />
                                <span className="truncate">Colores del coach</span>
                            </span>
                            <Switch
                                checked={useBrandColors}
                                onCheckedChange={handleToggleBrandColors}
                                disabled={isTogglingColors}
                                aria-label="Colores del coach"
                            />
                        </div>
                    </>
                )}
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
        </div>
    )
}
