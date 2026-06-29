'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import {
    Home,
    Apple,
    LogOut,
    CheckCircle,
    Dumbbell,
    PersonStanding,
    Gauge,
    History,
    Palette,
    ChevronRight,
    MoreHorizontal,
    X,
    PanelLeftClose,
    PanelLeft,
    type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/ThemeToggle'
import { PwaNavButton } from './PwaNavButton'
import { toggleClientBrandColors } from '@/app/c/[coach_slug]/_actions/client-root.actions'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { BRAND_APP_ICON } from '@/lib/brand-assets'

interface Props {
    coachSlug: string
    /** F2: URL prefix for in-app links — `/c/${coachSlug}` for standalone, `/e/${orgSlug}` under
     *  the enterprise area. Defaults to `/c/${coachSlug}` so existing /c rendering is unchanged. */
    basePath?: string
    coachBrand: string
    coachLogoUrl: string
    initialUseBrandColors?: boolean
    /** Espejo del modulo movement_assessment (resuelto server-side; gate real en la page). */
    showMovement?: boolean
    /** Espejo del modulo body_composition (resuelto server-side; gate real en la page). */
    showBodyComposition?: boolean
    /**
     * Master switch del dominio Nutricion para el alumno (resuelto server-side via
     * `resolveNutritionDomainEnabled`). `false` => el coach apago la nutricion para este alumno y
     * el tab "Plan Alimenticio" NO se muestra (render-only; la page tambien gatea). Default `true`
     * (fail-OPEN, espejo de `resolveNutritionDomainEnabled` con flag OFF).
     */
    showNutrition?: boolean
}

type NavItem = { href: string; label: string; short: string; icon: LucideIcon }

export function ClientNav({ coachSlug, basePath, coachBrand, coachLogoUrl, initialUseBrandColors = true, showMovement = false, showBodyComposition = false, showNutrition = true }: Props) {
    const base = basePath ?? `/c/${coachSlug}`
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isNavigating, setIsNavigating] = useState<string | null>(null)
    const [useBrandColors, setUseBrandColors] = useState(initialUseBrandColors)
    const [isTogglingColors, setIsTogglingColors] = useState(false)
    const [moreOpen, setMoreOpen] = useState(false)
    const reduce = useReducedMotion()

    // Reset navigating state when pathname changes
    useEffect(() => {
        setIsNavigating(null)
    }, [pathname])

    // Cerrar el panel "Más" al navegar (cambio de ruta).
    useEffect(() => {
        setMoreOpen(false)
    }, [pathname])

    // Estilo white-label del estado activo (preserva `var(--theme-primary)`).
    const activeColorStyle = { color: 'var(--theme-primary)' }
    const activeBgStyle = {
        backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)',
    }

    // Base 4 (zona del pulgar en mobile): Inicio · Plan (si showNutrition) · Aprender · Check-in.
    const baseItems: NavItem[] = [
        { href: `${base}/dashboard`, label: 'Inicio', short: 'Inicio', icon: Home },
        ...(showNutrition ? [{ href: `${base}/nutrition`, label: 'Plan Alimenticio', short: 'Plan', icon: Apple }] : []),
        { href: `${base}/exercises`, label: 'Aprender', short: 'Aprender', icon: Dumbbell },
        { href: `${base}/check-in`, label: 'Check-in', short: 'Check-in', icon: CheckCircle },
    ]

    // Módulos de pago (entitled server-side). Viven en el grupo "Módulos" del sidebar desktop y en
    // el panel "Más" del mobile.
    const moduleItems: NavItem[] = [
        ...(showMovement ? [{ href: `${base}/movimiento`, label: 'Movimiento', short: 'Movimiento', icon: PersonStanding }] : []),
        ...(showBodyComposition ? [{ href: `${base}/bodycomp`, label: 'Composición', short: 'Composición', icon: Gauge }] : []),
    ]

    // Overflow del mobile ("Más"): Historial + módulos entitled. (Las acciones de cuenta — tema,
    // colores, instalar, cerrar sesión — se renderizan aparte dentro del sheet.)
    const overflowItems: NavItem[] = [
        { href: `${base}/workout-history`, label: 'Historial', short: 'Historial', icon: History },
        ...moduleItems,
    ]
    const isMoreActive = overflowItems.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'))

    // Estado activo del nav primario — preserva los special-cases (workout-history => Inicio activo,
    // ejecución `/workout`, y el pulso optimista `isNavigating`).
    const isActiveHref = (href: string) =>
        pathname === href ||
        pathname.startsWith(href + '/workout') ||
        (href === `${base}/dashboard` && pathname === `${base}/workout-history`) ||
        isNavigating === href

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push(`${base}/login`)
        router.refresh()
    }

    const handleToggleBrandColors = async () => {
        setIsTogglingColors(true)
        const newValue = !useBrandColors
        setUseBrandColors(newValue)

        try {
            const res = await toggleClientBrandColors(newValue, coachSlug)
            if (res.error) {
                setUseBrandColors(!newValue) // revert
                toast.error('Error al guardar preferencia')
            } else {
                toast.success(newValue ? 'Colores del Coach activados' : 'Colores por defecto activados')
                router.refresh() // Re-runs middleware and Server Components to pick up new color header
            }
        } catch (error) {
            setUseBrandColors(!newValue) // revert
        } finally {
            setIsTogglingColors(false)
        }
    }

    // Don't show nav on login, register, onboarding, etc, or during workout execution
    if (pathname.includes('/login') || pathname.includes('/register') || pathname.includes('/forgot') || pathname.includes('/onboarding')) {
        return null
    }

    // Solo ejecución de plan (/workout/[planId]); no ocultar rutas tipo /workout-history
    const isWorkout = pathname.includes('/workout/')

    // DESKTOP — link vertical del sidebar (restyle DS, white-label en activo).
    const renderDesktopLink = (item: NavItem) => {
        const isActive = isActiveHref(item.href)
        const Icon = item.icon
        return (
            <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={() => {
                    if (pathname !== item.href) setIsNavigating(item.href)
                }}
                title={isCollapsed ? item.label : undefined}
                className={cn(
                    'group flex w-full flex-none items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-sm font-semibold transition-all duration-300',
                    isCollapsed ? 'justify-center px-0' : 'justify-start',
                    isActive ? 'text-strong' : 'text-muted hover:text-strong hover:bg-surface-sunken',
                    isNavigating === item.href && 'animate-pulse'
                )}
                style={isActive ? activeBgStyle : undefined}
            >
                <Icon
                    className={cn(
                        'h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
                        isActive ? '' : 'text-muted group-hover:text-strong'
                    )}
                    style={isActive ? activeColorStyle : undefined}
                />
                <span className={cn('truncate', isCollapsed && 'hidden')} style={isActive ? activeColorStyle : undefined}>
                    {item.label}
                </span>
                {isActive && !isCollapsed && (
                    <ChevronRight className="ml-auto h-3 w-3 opacity-60" style={activeColorStyle} />
                )}
            </Link>
        )
    }

    // MOBILE — tile de la barra inferior (44px+ touch target, zona del pulgar).
    const renderBaseTile = (item: NavItem) => {
        const isActive = isActiveHref(item.href)
        const Icon = item.icon
        return (
            <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-label={item.label}
                title={item.label}
                onClick={() => {
                    if (pathname !== item.href) setIsNavigating(item.href)
                }}
                className={cn(
                    'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-control px-1 py-1.5 transition-colors',
                    isActive ? '' : 'hover:bg-surface-sunken',
                    isNavigating === item.href && 'animate-pulse'
                )}
            >
                {isActive && (
                    <span className="absolute -top-0.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-pill" style={{ backgroundColor: 'var(--theme-primary)' }} />
                )}
                <Icon
                    className={cn('h-[22px] w-[22px] flex-shrink-0 transition-transform duration-200', isActive ? '' : 'text-muted')}
                    style={isActive ? activeColorStyle : undefined}
                />
                <span
                    className={cn('max-w-full truncate text-[10px] font-semibold leading-tight', isActive ? '' : 'text-muted')}
                    style={isActive ? activeColorStyle : undefined}
                >
                    {item.short}
                </span>
            </Link>
        )
    }

    return (
        <>
            {/* ============================ DESKTOP SIDEBAR ============================ */}
            {/* El mobile usa el bottom bar "4 + Más" más abajo. */}
            <aside
                className={cn(
                    'client-nav-desktop hidden md:sticky md:top-0 md:flex md:h-dvh md:flex-col bg-surface-card border-r border-subtle transition-all duration-300',
                    isCollapsed ? 'md:w-20' : 'md:w-64'
                )}
            >
                {/* Logo area */}
                <div className={cn('flex items-center border-b border-subtle py-6', isCollapsed ? 'flex-col justify-center gap-4 px-0' : 'justify-between px-6')}>
                    <div className={cn('flex min-w-0 items-center gap-3', isCollapsed && 'justify-center')}>
                        <div className={cn('relative h-10 flex-shrink-0', isCollapsed ? 'w-10' : 'w-[6.75rem]')}>
                            <Image
                                src={coachLogoUrl === BRAND_APP_ICON ? BRAND_APP_ICON : coachLogoUrl}
                                alt={`${coachBrand} logo`}
                                fill
                                sizes={isCollapsed ? '40px' : '108px'}
                                className={cn('object-contain', isCollapsed && 'p-1')}
                                priority
                            />
                        </div>
                        {!isCollapsed && (
                            <div className="min-w-0 overflow-hidden">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">Mi Coach</p>
                                <p className="truncate font-display text-sm font-bold text-strong" style={{ color: 'var(--theme-primary)' }}>
                                    {coachBrand}
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        aria-label={isCollapsed ? 'Expandir menú' : 'Contraer menú'}
                        className="rounded-control p-1.5 text-muted transition-colors hover:bg-surface-sunken hover:text-strong"
                    >
                        {isCollapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                    </button>
                </div>

                {/* Navigation Links (Desktop) */}
                <div className="min-h-0 flex-1 overflow-visible">
                    <nav className="flex min-h-0 flex-1 flex-col justify-start gap-1 overflow-y-auto px-3 py-4 custom-scrollbar">
                        {baseItems.map(renderDesktopLink)}
                        {moduleItems.length > 0 && (
                            <>
                                <div className={cn('flex shrink-0 select-none flex-col gap-1 pt-2', isCollapsed ? 'items-center' : 'px-3')} aria-hidden="true">
                                    <div className="h-px w-full bg-border-subtle" />
                                    {!isCollapsed && <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Módulos</p>}
                                </div>
                                {moduleItems.map(renderDesktopLink)}
                            </>
                        )}
                    </nav>
                </div>

                {/* Bottom area (Desktop only) */}
                <div className={cn('flex flex-col border-t border-subtle', isCollapsed ? 'items-center gap-3 p-3' : 'gap-1 px-3 py-4')}>
                    <PwaNavButton isCollapsed={isCollapsed} />
                    {!isCollapsed ? (
                        <>
                            <div className="flex items-center justify-between rounded-control px-3 py-2">
                                <span className="text-sm font-medium text-body">Tema</span>
                                <ThemeToggle />
                            </div>
                            <div className="flex items-center justify-between gap-3 rounded-control px-3 py-2">
                                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-body">
                                    <Palette className="h-4 w-4 flex-shrink-0 text-muted" />
                                    <span className="truncate">Colores del coach</span>
                                </span>
                                <Switch checked={useBrandColors} onCheckedChange={handleToggleBrandColors} disabled={isTogglingColors} aria-label="Colores del coach" />
                            </div>
                        </>
                    ) : (
                        <ThemeToggle />
                    )}
                    <button
                        onClick={handleSignOut}
                        title={isCollapsed ? 'Cerrar sesión' : undefined}
                        className={cn(
                            'group flex items-center rounded-control text-sm font-medium text-muted transition-all duration-200 hover:bg-destructive/10 hover:text-destructive',
                            isCollapsed ? 'h-10 w-10 justify-center p-0' : 'w-full gap-3 px-3 py-2.5'
                        )}
                    >
                        <LogOut className="h-4 w-4 flex-shrink-0 group-hover:text-destructive" />
                        {!isCollapsed && <span>Cerrar sesión</span>}
                    </button>
                </div>
            </aside>

            {/* ============================ MOBILE "MÁS" SHEET ============================ */}
            <AnimatePresence>
                {moreOpen && !isWorkout && (
                    <>
                        <motion.div
                            key="client-more-backdrop"
                            className="md:hidden fixed inset-0 z-[58] bg-black/40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: reduce ? 0 : 0.18 }}
                            onClick={() => setMoreOpen(false)}
                            aria-hidden="true"
                        />
                        <motion.div
                            key="client-more-panel"
                            role="dialog"
                            aria-label="Más opciones de navegación"
                            className="md:hidden fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-2 rounded-t-card border-t border-subtle bg-surface-card px-3 pt-3 pb-safe shadow-md"
                            initial={reduce ? { opacity: 0 } : { y: '100%' }}
                            animate={reduce ? { opacity: 1 } : { y: 0 }}
                            exit={reduce ? { opacity: 0 } : { y: '100%' }}
                            transition={{ type: reduce ? 'tween' : 'spring', duration: reduce ? 0.18 : undefined, damping: 26, stiffness: 280 }}
                        >
                            <div className="mb-1 flex items-center justify-between px-2">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-muted">Más</p>
                                <button
                                    type="button"
                                    onClick={() => setMoreOpen(false)}
                                    aria-label="Cerrar"
                                    className="flex h-9 w-9 items-center justify-center rounded-control text-muted hover:bg-surface-sunken hover:text-strong"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Navegación overflow: Historial + módulos entitled */}
                            <div className="grid grid-cols-2 gap-1.5">
                                {overflowItems.map((item) => {
                                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                                    const Icon = item.icon
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            prefetch={false}
                                            title={item.label}
                                            aria-label={item.label}
                                            onClick={() => setMoreOpen(false)}
                                            className={cn(
                                                'flex min-h-[44px] items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-sm font-semibold transition-colors',
                                                isActive ? 'text-strong' : 'text-muted hover:bg-surface-sunken hover:text-strong'
                                            )}
                                            style={isActive ? activeBgStyle : undefined}
                                        >
                                            <Icon className={cn('h-5 w-5 flex-shrink-0', isActive ? '' : 'text-muted')} style={isActive ? activeColorStyle : undefined} />
                                            <span className="truncate">{item.label}</span>
                                        </Link>
                                    )
                                })}
                            </div>

                            {/* Acciones de cuenta (en sitio — no son rutas) */}
                            <div className="flex flex-col gap-1 border-t border-subtle pt-2">
                                <PwaNavButton />
                                <div className="flex min-h-[44px] items-center justify-between rounded-control px-3 py-2">
                                    <span className="text-sm font-medium text-body">Tema</span>
                                    <ThemeToggle />
                                </div>
                                <div className="flex min-h-[44px] items-center justify-between gap-3 rounded-control px-3 py-2">
                                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-body">
                                        <Palette className="h-4 w-4 flex-shrink-0 text-muted" />
                                        <span className="truncate">Colores del coach</span>
                                    </span>
                                    <Switch checked={useBrandColors} onCheckedChange={handleToggleBrandColors} disabled={isTogglingColors} aria-label="Colores del coach" />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSignOut}
                                    className="group flex min-h-[44px] items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-destructive/10 hover:text-destructive"
                                >
                                    <LogOut className="h-5 w-5 flex-shrink-0 group-hover:text-destructive" />
                                    <span>Cerrar sesión</span>
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ============================ MOBILE BOTTOM BAR ============================ */}
            {/* Patrón nativo "4 primarios + Más" (espejo de CoachSidebar). Oculto durante la ejecución
                de plan (/workout/) y en desktop (md:). */}
            <nav
                aria-label="Navegación principal"
                className={cn(
                    'client-nav-mobile md:hidden fixed bottom-0 left-0 right-0 z-[59] flex items-stretch gap-0.5 border-t border-subtle bg-surface-card/95 backdrop-blur-xl px-1.5 pt-1.5 pb-safe pl-safe pr-safe shadow-md',
                    isWorkout && 'hidden'
                )}
            >
                {baseItems.map(renderBaseTile)}
                <button
                    type="button"
                    onClick={() => setMoreOpen((o) => !o)}
                    aria-label="Más"
                    aria-expanded={moreOpen}
                    className={cn(
                        'relative flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-control px-1 py-1.5 transition-colors',
                        isMoreActive || moreOpen ? '' : 'hover:bg-surface-sunken'
                    )}
                >
                    {(isMoreActive || moreOpen) && (
                        <span className="absolute -top-0.5 left-1/2 h-1 w-8 -translate-x-1/2 rounded-pill" style={{ backgroundColor: 'var(--theme-primary)' }} />
                    )}
                    <MoreHorizontal className={cn('h-[22px] w-[22px] flex-shrink-0', isMoreActive || moreOpen ? '' : 'text-muted')} style={isMoreActive || moreOpen ? activeColorStyle : undefined} />
                    <span className={cn('text-[10px] font-semibold leading-tight', isMoreActive || moreOpen ? '' : 'text-muted')} style={isMoreActive || moreOpen ? activeColorStyle : undefined}>
                        Más
                    </span>
                </button>
            </nav>
        </>
    )
}
