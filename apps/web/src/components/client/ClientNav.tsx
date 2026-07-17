'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    Home,
    Apple,
    CheckCircle,
    Dumbbell,
    PersonStanding,
    Gauge,
    History,
    ChevronRight,
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
import { NavIcon, type NavConcept } from './NavIcon'
import { ThemedLogo } from '@/components/brand/ThemedLogo'

interface Props {
    coachSlug: string
    /** F2: URL prefix for in-app links — `/c/${coachSlug}` for standalone, `/e/${orgSlug}` under
     *  the enterprise area. Defaults to `/c/${coachSlug}` so existing /c rendering is unchanged. */
    basePath?: string
    coachBrand: string
    coachLogoUrl: string
    /** Logo modo oscuro del coach; cae al claro si no existe. */
    coachLogoDarkUrl?: string
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

// `concept` cablea la silueta propia del CEO (NavIcon, tinte via currentColor).
// Si falta, se renderiza el `icon` de lucide de siempre (ej. "Aprender").
type NavItem = { href: string; label: string; short: string; icon: LucideIcon; concept?: NavConcept }

export function ClientNav({ coachSlug, basePath, coachBrand, coachLogoUrl, coachLogoDarkUrl, showMovement = false, showBodyComposition = false, showNutrition = true }: Props) {
    const base = basePath ?? `/c/${coachSlug}`
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isNavigating, setIsNavigating] = useState<string | null>(null)
    const [moreOpen, setMoreOpen] = useState(false)
    // Cápsula flotante mobile: hide-on-scroll-down / reveal-on-scroll-up → colapsa a pill
    // icon-only (TabBar `minimized`: insets 14→72, labels fade).
    const [minimized, setMinimized] = useState(false)
    const reduce = useReducedMotion()

    // Reset navigating state when pathname changes
    useEffect(() => {
        setIsNavigating(null)
    }, [pathname])

    // Cerrar el panel "Más" al navegar (cambio de ruta).
    useEffect(() => {
        setMoreOpen(false)
    }, [pathname])

    // Hide-on-scroll de la cápsula: el scroll móvil ocurre en el documento (window) —
    // `<main>` es `min-h-dvh` (crece con el contenido), no un contenedor de alto fijo. Si el
    // window no scrollea el listener simplemente no dispara (degradación sin daño).
    useEffect(() => {
        let lastY = window.scrollY
        let ticking = false
        const onScroll = () => {
            if (ticking) return
            ticking = true
            requestAnimationFrame(() => {
                const y = window.scrollY
                const dy = y - lastY
                if (Math.abs(dy) > 6) {
                    // baja + más allá de 80px → minimiza; sube o cerca del top → revela
                    setMinimized(dy > 0 && y > 80)
                    lastY = y
                }
                ticking = false
            })
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [pathname])

    // Estilo white-label del estado activo (preserva `var(--theme-primary)`).
    const activeColorStyle = { color: 'var(--theme-primary)' }
    const activeBgStyle = {
        backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
        borderColor: 'color-mix(in srgb, var(--theme-primary) 20%, transparent)',
    }

    // Base 4 (zona del pulgar en mobile): Inicio · Plan (si showNutrition) · Aprender · Check-in.
    const baseItems: NavItem[] = [
        { href: `${base}/dashboard`, label: 'Inicio', short: 'Inicio', icon: Home, concept: 'home' },
        ...(showNutrition ? [{ href: `${base}/nutrition`, label: 'Nutrición', short: 'Nutrición', icon: Apple, concept: 'nutricion' as NavConcept }] : []),
        { href: `${base}/exercises`, label: 'Aprender', short: 'Aprender', icon: Dumbbell, concept: 'aprender' },
        { href: `${base}/check-in`, label: 'Check-in', short: 'Check-in', icon: CheckCircle, concept: 'check-in' },
    ]

    // Módulos de pago (entitled server-side). Viven en el grupo "Módulos" del sidebar desktop y en
    // el panel "Más" del mobile.
    const moduleItems: NavItem[] = [
        ...(showMovement ? [{ href: `${base}/movimiento`, label: 'Movimiento', short: 'Movimiento', icon: PersonStanding, concept: 'movimiento' as NavConcept }] : []),
        ...(showBodyComposition ? [{ href: `${base}/bodycomp`, label: 'Composición', short: 'Composición', icon: Gauge, concept: 'composicion' as NavConcept }] : []),
    ]

    // Historial: vive en el sidebar desktop (paridad) y como acceso del sheet "Más" mobile.
    const historyItem: NavItem = { href: `${base}/workout-history`, label: 'Historial', short: 'Historial', icon: History, concept: 'historial' }

    // Rutas "bajo Más" para el estado activo del tab mobile: Historial, Mi perfil y los módulos
    // entitled. Los módulos ya NO se listan en el sheet (se alcanzan via Mi perfil → /perfil), pero
    // se mantienen aquí para que el tab "Más" quede activo cuando el alumno está dentro de uno.
    const moreRoutes: string[] = [historyItem.href, `${base}/perfil`, ...moduleItems.map((i) => i.href)]
    const isMoreActive = moreRoutes.some((href) => pathname === href || pathname.startsWith(href + '/'))

    // Estado activo del nav primario — preserva la ejecución `/workout` y el pulso optimista
    // `isNavigating`. (Historial ya es un link propio del sidebar desktop, así que /workout-history
    // deja de forzar "Inicio" activo — resaltar Historial es lo correcto.)
    const isActiveHref = (href: string) =>
        pathname === href ||
        pathname.startsWith(href + '/workout') ||
        isNavigating === href

    // Píldora deslizante de la cápsula flotante (mobile): índice del tab activo entre los
    // `baseItems` + el botón "Más" (último). -1 => ninguno (indicador oculto).
    const mobileTabCount = baseItems.length + 1
    const mobileMoreActive = isMoreActive || moreOpen
    const mobileActiveIndex = mobileMoreActive
        ? baseItems.length
        : baseItems.findIndex((i) => isActiveHref(i.href))

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push(`${base}/login`)
        router.refresh()
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
                    'group relative flex w-full flex-none items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-sm font-semibold transition-all duration-300',
                    isCollapsed ? 'justify-center px-0' : 'justify-start',
                    isActive ? 'text-strong' : 'text-muted hover:text-strong hover:bg-surface-sunken',
                    isNavigating === item.href && 'animate-pulse'
                )}
                style={isActive ? activeBgStyle : undefined}
            >
                {/* .dt-nav-accent — barra-acento izquierda del activo (3px, white-label) */}
                <span
                    aria-hidden="true"
                    className={cn(
                        'pointer-events-none absolute left-[-12px] top-1/2 w-[3px] -translate-y-1/2 rounded-r-[3px] transition-[height] duration-200 ease-[cubic-bezier(.22,1,.36,1)]',
                        isActive ? 'h-[22px]' : 'h-0'
                    )}
                    style={{ backgroundColor: 'var(--theme-primary)' }}
                />
                {item.concept ? (
                    <NavIcon
                        concept={item.concept}
                        className={cn(
                            'h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
                            isActive ? '' : 'text-muted group-hover:text-strong'
                        )}
                        style={isActive ? activeColorStyle : undefined}
                    />
                ) : (
                    <Icon
                        className={cn(
                            'h-5 w-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
                            isActive ? '' : 'text-muted group-hover:text-strong'
                        )}
                        style={isActive ? activeColorStyle : undefined}
                    />
                )}
                <span className={cn('truncate', isCollapsed && 'hidden')} style={isActive ? activeColorStyle : undefined}>
                    {item.label}
                </span>
            </Link>
        )
    }

    // MOBILE — tile de la cápsula flotante (44px+ touch target, zona del pulgar). El indicador
    // activo es la píldora deslizante detrás del tab (motivo iOS-26 del DS); el glifo activo se
    // rellena (fill-opacity .18) y el label sube a 800.
    const renderBaseTile = (item: NavItem) => {
        const isActive = isActiveHref(item.href)
        const Icon = item.icon
        return (
            <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                title={item.label}
                onClick={() => {
                    if (pathname !== item.href) setIsNavigating(item.href)
                }}
                className={cn('eva-tabbar-press', isNavigating === item.href && 'animate-pulse')}
                style={{
                    position: 'relative',
                    zIndex: 1,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: minimized ? 0 : 3,
                    padding: minimized ? '5px 0' : '6px 0',
                    minHeight: 44,
                    border: 'none',
                    background: 'transparent',
                    color: isActive ? 'var(--theme-primary)' : 'var(--text-muted)',
                    textDecoration: 'none',
                    transition: 'color var(--dur-base) var(--ease-out), padding var(--dur-base) var(--ease-out)',
                }}
            >
                <span
                    className={cn(
                        'inline-flex h-[22px] w-[22px] items-center justify-center',
                        isActive && '[&_svg]:fill-current [&_svg]:[fill-opacity:0.18]'
                    )}
                    style={{ transform: isActive ? 'translateY(-1px)' : 'none', transition: 'transform var(--dur-base) var(--ease-spring)' }}
                >
                    {item.concept ? (
                        <NavIcon concept={item.concept} className="h-[22px] w-[22px]" />
                    ) : (
                        <Icon className="h-[22px] w-[22px]" />
                    )}
                </span>
                <span
                    style={{
                        fontSize: 10,
                        fontWeight: isActive ? 800 : 600,
                        letterSpacing: '0.01em',
                        lineHeight: 1.1,
                        maxHeight: minimized ? 0 : 14,
                        opacity: minimized ? 0 : 1,
                        overflow: 'hidden',
                        maxWidth: '100%',
                        transition: 'max-height var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
                    }}
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
                            <ThemedLogo
                                light={coachLogoUrl}
                                dark={coachLogoDarkUrl}
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
                        {renderDesktopLink(historyItem)}
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
                        <NavIcon concept="cerrar-sesion" className="h-4 w-4 flex-shrink-0" />
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

                            {/* Mi perfil — pantalla completa (AlumnoMas): identidad, racha, módulos,
                                cuenta y zona de peligro. El sheet queda como acceso rápido. */}
                            <Link
                                href={`${base}/perfil`}
                                prefetch={false}
                                onClick={() => setMoreOpen(false)}
                                aria-label="Mi perfil"
                                className={cn(
                                    'flex min-h-[52px] items-center gap-3 rounded-control border border-transparent px-3 py-2.5 transition-colors',
                                    pathname === `${base}/perfil` ? 'text-strong' : 'bg-surface-sunken hover:opacity-90'
                                )}
                                style={pathname === `${base}/perfil` ? activeBgStyle : undefined}
                            >
                                <span
                                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-control"
                                    style={{ background: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)', color: 'var(--theme-primary)' }}
                                >
                                    <NavIcon concept="perfil" className="h-[18px] w-[18px]" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-bold text-strong">Mi perfil</div>
                                    <div className="text-[12px] text-muted">Racha, módulos, cuenta y más</div>
                                </div>
                                <ChevronRight className="h-[18px] w-[18px] flex-shrink-0 text-muted" />
                            </Link>

                            {/* Navegación overflow: Historial. (Tema, colores y cerrar sesión viven en
                                Mi perfil; los módulos entitled se alcanzan desde ahí.) */}
                            {(() => {
                                const isActive = pathname === historyItem.href || pathname.startsWith(historyItem.href + '/')
                                const Icon = historyItem.icon
                                return (
                                    <Link
                                        href={historyItem.href}
                                        prefetch={false}
                                        title={historyItem.label}
                                        aria-label={historyItem.label}
                                        onClick={() => setMoreOpen(false)}
                                        className={cn(
                                            'flex min-h-[44px] items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-sm font-semibold transition-colors',
                                            isActive ? 'text-strong' : 'text-muted hover:bg-surface-sunken hover:text-strong'
                                        )}
                                        style={isActive ? activeBgStyle : undefined}
                                    >
                                        {historyItem.concept ? (
                                            <NavIcon concept={historyItem.concept} className={cn('h-5 w-5 flex-shrink-0', isActive ? '' : 'text-muted')} style={isActive ? activeColorStyle : undefined} />
                                        ) : (
                                            <Icon className={cn('h-5 w-5 flex-shrink-0', isActive ? '' : 'text-muted')} style={isActive ? activeColorStyle : undefined} />
                                        )}
                                        <span className="truncate">{historyItem.label}</span>
                                    </Link>
                                )
                            })()}

                            {/* Instalar app — utilidad PWA (no es navegación, no tiene hogar en /perfil) */}
                            <div className="flex flex-col gap-1 border-t border-subtle pt-2">
                                <PwaNavButton />
                            </div>

                            {/* Cerrar sesión — al final del sheet, tono danger sutil. Reusa el mismo
                                signOut del sidebar desktop (Supabase → login del coach). */}
                            <button
                                type="button"
                                onClick={handleSignOut}
                                aria-label="Cerrar sesión"
                                className="flex min-h-[44px] items-center gap-3 rounded-control border border-transparent px-3 py-2.5 text-sm font-semibold text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                                <NavIcon concept="cerrar-sesion" className="h-5 w-5 flex-shrink-0" />
                                <span className="truncate">Cerrar sesión</span>
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ============================ MOBILE FLOATING CAPSULE ============================ */}
            {/* Cápsula flotante de vidrio esmerilado (decisión del DS, iOS-26) — espejo de la
                cápsula del coach (CoachSidebar / TabBar `floating`), tinte white-label vía
                `--theme-primary`. Patrón "4 primarios + Más". Oculta durante la ejecución de plan
                (/workout/) y en desktop (md:). */}
            {!isWorkout && (
                <nav
                    aria-label="Navegación principal"
                    className="client-nav-mobile flex md:hidden"
                    style={{
                        position: 'fixed',
                        left: minimized ? 72 : 14,
                        right: minimized ? 72 : 14,
                        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
                        zIndex: 59,
                        alignItems: 'stretch',
                        padding: 8,
                        borderRadius: 30,
                        background: 'color-mix(in srgb, var(--surface-card) 74%, transparent)',
                        backdropFilter: 'saturate(180%) blur(26px)',
                        WebkitBackdropFilter: 'saturate(180%) blur(26px)',
                        border: '1px solid color-mix(in srgb, var(--text-strong) 9%, transparent)',
                        boxShadow:
                            '0 1px 0 rgba(255,255,255,0.45) inset, 0 14px 36px rgba(13,18,28,0.24), 0 4px 12px rgba(13,18,28,0.12)',
                        transition:
                            'left var(--dur-slow) var(--ease-spring), right var(--dur-slow) var(--ease-spring)',
                    }}
                >
                    {/* Píldora deslizante detrás del tab activo (tinte white-label del coach). */}
                    <span
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            top: 8,
                            bottom: 8,
                            left: `calc(8px + ${mobileActiveIndex < 0 ? 0 : mobileActiveIndex} * ((100% - 16px) / ${mobileTabCount}))`,
                            width: `calc((100% - 16px) / ${mobileTabCount})`,
                            borderRadius: 22,
                            background: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--theme-primary) 24%, transparent)',
                            transition: 'left var(--dur-slow) var(--ease-spring)',
                            pointerEvents: 'none',
                            zIndex: 0,
                            opacity: mobileActiveIndex < 0 ? 0 : 1,
                        }}
                    />
                    {baseItems.map(renderBaseTile)}
                    <button
                        type="button"
                        onClick={() => setMoreOpen((o) => !o)}
                        aria-label="Más"
                        aria-expanded={moreOpen}
                        className="eva-tabbar-press"
                        style={{
                            position: 'relative',
                            zIndex: 1,
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: minimized ? 0 : 3,
                            padding: minimized ? '5px 0' : '6px 0',
                            minHeight: 44,
                            border: 'none',
                            background: 'transparent',
                            color: mobileMoreActive ? 'var(--theme-primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'color var(--dur-base) var(--ease-out), padding var(--dur-base) var(--ease-out)',
                        }}
                    >
                        <span
                            className={cn(
                                'inline-flex h-[22px] w-[22px] items-center justify-center',
                                mobileMoreActive && '[&_svg]:fill-current [&_svg]:[fill-opacity:0.18]'
                            )}
                            style={{ transform: mobileMoreActive ? 'translateY(-1px)' : 'none', transition: 'transform var(--dur-base) var(--ease-spring)' }}
                        >
                            <NavIcon concept="mas" className="h-[22px] w-[22px]" />
                        </span>
                        <span
                            style={{
                                fontSize: 10,
                                fontWeight: mobileMoreActive ? 800 : 600,
                                letterSpacing: '0.01em',
                                lineHeight: 1.1,
                                maxHeight: minimized ? 0 : 14,
                                opacity: minimized ? 0 : 1,
                                overflow: 'hidden',
                                transition: 'max-height var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
                            }}
                        >
                            Más
                        </span>
                    </button>
                </nav>
            )}
        </>
    )
}
