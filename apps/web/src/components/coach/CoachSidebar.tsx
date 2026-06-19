'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    LogOut,
    PanelLeftClose,
    PanelLeft,
    HelpCircle,
    Building2,
    MoreHorizontal,
    X,
    type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NewsBellButton } from '@/components/coach/NewsBellButton'
import { EvaBrandIcon } from '@/components/landing/LandingBrandMark'
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher'
import { getVisibleNavItems, splitNavItems, type NavModule } from '@/components/coach/coach-nav'
import type { WorkspaceSummary, WorkspaceType } from '@/domain/auth/types'
import type { EnabledModules } from '@/services/entitlements.service'

interface CoachSidebarProps {
    coachName: string
    coachBrand: string
    primaryColor?: string
    subscriptionStatus?: string | null
    enterpriseContext?: {
        orgSlug: string
        orgName: string
        orgRole: string
    } | null
    workspaces?: WorkspaceSummary[]
    currentWorkspaceLabel?: string
    /** Workspace ACTIVO — gobierna qué módulos del nav se muestran (separación de flujos). */
    activeWorkspaceType?: WorkspaceType | null
    /** Módulos toggleables habilitados para el contexto activo (resuelto server-side en el layout). */
    enabledModules?: EnabledModules | null
    /**
     * Dominios de feature-prefs cuyo master switch `_enabled` el coach apagó (resuelto
     * server-side en el layout). Una entrada con `featureDomain` en este set se oculta del nav.
     * Ausente/vacío ⇒ ningún dominio apagado (fail-open).
     */
    disabledDomains?: string[] | null
}

/**
 * Mobile bottom bar — tabs PRIMARIOS (zona del pulgar). El resto del nav vive detrás de "Más"
 * (patrón nativo, espejo de `apps/mobile/components/coach/CoachMobileChrome.tsx`:
 * `PRIMARY_TABS = ['home','clientes','builder','nutricion']`). NUNCA scroll horizontal plano.
 * Match por `key` del registro `NAV_MODULES` (estable e independiente del label/contexto).
 */
const MOBILE_PRIMARY_KEYS = ['dashboard', 'clients', 'programs', 'nutrition'] as const

export function CoachSidebar({ coachName, coachBrand, primaryColor, subscriptionStatus, enterpriseContext, workspaces, currentWorkspaceLabel, activeWorkspaceType, enabledModules, disabledDomains }: CoachSidebarProps) {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [moreOpen, setMoreOpen] = useState(false)
    const reduceMotion = useReducedMotion()

    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved === 'true') setIsCollapsed(true)
    }, [])

    // Cerrar el panel "Más" al navegar (cambio de ruta).
    useEffect(() => {
        setMoreOpen(false)
    }, [pathname])

    const activeColorStyle = primaryColor ? { color: primaryColor } : undefined
    const activeBgStyle = primaryColor ? { 
        backgroundColor: `color-mix(in srgb, ${primaryColor} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${primaryColor} 20%, transparent)`
    } : undefined

    const toggleSidebar = () => {
        const newState = !isCollapsed
        setIsCollapsed(newState)
        localStorage.setItem('sidebar-collapsed', String(newState))
    }

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    const isBuilder = pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')
    const isOrgAdmin = enterpriseContext?.orgRole === 'org_owner' || enterpriseContext?.orgRole === 'org_admin'
    // Registro nav-como-módulos: cada flujo (standalone/enterprise/team) ve SOLO sus módulos.
    const disabledDomainSet = disabledDomains && disabledDomains.length > 0 ? new Set(disabledDomains) : null
    const visibleNavItems = getVisibleNavItems({ activeWorkspaceType, subscriptionStatus, enabledModules, disabledDomains: disabledDomainSet })
    // Particionar para el grupo "MÓDULOS" (DESKTOP): core va arriba y, si hay módulos comprados,
    // se agrupan bajo un divisor.
    const { core: coreNavItems, modules: moduleNavItems } = splitNavItems(visibleNavItems)
    const hasModuleGroup = moduleNavItems.length > 0

    // MOBILE — patrón "4 primarios + Más" (espejo de CoachMobileChrome). Los primarios se eligen por
    // `key` (estable); todo lo demás (Opciones, Soporte, módulos entitled, Equipo) vive tras "Más".
    // Si el status está bloqueado, getVisibleNavItems ya colapsó a [Reactivar] ⇒ ese único item entra
    // como primario y no hay overflow.
    const mobilePrimary = MOBILE_PRIMARY_KEYS
        .map((k) => visibleNavItems.find((i) => i.key === k))
        .filter((i): i is NavModule => i != null)
    const primaryKeySet = new Set(mobilePrimary.map((i) => i.key))
    const mobileOverflow = visibleNavItems.filter((i) => !primaryKeySet.has(i.key))
    const hasMobileOverflow = mobileOverflow.length > 0
    const isMoreActive = mobileOverflow.some(
        (i) => pathname === i.href || pathname.startsWith(i.href + '/')
    )

    // DESKTOP — link vertical del sidebar (sin las clases base mobile; el mobile usa su propio bottom bar).
    const renderNavLink = (item: NavModule) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        const Icon = item.icon
        return (
            <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                title={item.label}
                className={cn(
                    'flex w-full flex-none flex-row items-center gap-3 rounded-xl border border-transparent px-4 py-2 text-sm font-semibold transition-all duration-300 group',
                    isCollapsed ? 'justify-center px-0' : 'justify-start',
                    isActive
                        ? 'text-sidebar-foreground bg-primary/10 border-primary/20 dark:shadow-[0_0_15px_-5px_rgba(var(--theme-primary-rgb,0,122,255),0.4)]'
                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent'
                )}
                style={isActive ? activeBgStyle : undefined}
            >
                <Icon
                    className={cn(
                        'w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110',
                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-foreground'
                    )}
                    style={isActive ? activeColorStyle : undefined}
                />
                <span
                    className={cn(
                        'max-w-full truncate text-left leading-tight tracking-wide',
                        isCollapsed && 'hidden'
                    )}
                >
                    <span className="uppercase text-[11px]">{item.label}</span>
                </span>
            </Link>
        )
    }

    // MOBILE — tile de la barra inferior (44px+ touch target, zona del pulgar).
    const renderMobileTile = (
        tile: { key: string; label: string; short: string; icon: LucideIcon },
        opts: { active: boolean; href?: string; onClick?: () => void }
    ) => {
        const Icon = tile.icon
        const label = tile.short
        const ariaLabel = tile.label
        const inner = (
            <>
                <Icon
                    className={cn(
                        'h-[22px] w-[22px] flex-shrink-0 transition-transform duration-200',
                        opts.active ? 'text-primary' : 'text-muted-foreground'
                    )}
                    style={opts.active ? activeColorStyle : undefined}
                />
                <span
                    className={cn(
                        'max-w-full truncate text-center text-[10px] font-semibold leading-tight tracking-wide',
                        opts.active ? 'text-primary' : 'text-muted-foreground'
                    )}
                    style={opts.active ? activeColorStyle : undefined}
                >
                    {label}
                </span>
            </>
        )
        const tileClass = cn(
            'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition-colors',
            opts.active ? 'bg-primary/10' : 'hover:bg-sidebar-accent'
        )
        if (opts.href) {
            return (
                <Link
                    key={tile.key}
                    href={opts.href}
                    prefetch={false}
                    title={ariaLabel}
                    aria-label={ariaLabel}
                    className={tileClass}
                    style={opts.active ? activeBgStyle : undefined}
                >
                    {inner}
                </Link>
            )
        }
        return (
            <button
                key={tile.key}
                type="button"
                onClick={opts.onClick}
                aria-label={ariaLabel}
                aria-expanded={moreOpen}
                className={tileClass}
                style={opts.active ? activeBgStyle : undefined}
            >
                {inner}
            </button>
        )
    }

    return (
        <>
            {/* Mobile Top Header — oculto en builder para evitar doble barra fija */}
            <div
                className={cn(
                    "md:hidden fixed top-0 left-0 right-0 z-[55] flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 pt-safe pb-3",
                    isBuilder && "hidden"
                )}
            >
                <div className="flex min-w-0 items-center gap-2.5">
                    <EvaBrandIcon className="h-8 w-8 shrink-0 sm:h-8 sm:w-8" />
                    <span className="font-bold text-base truncate max-w-[150px] text-sidebar-foreground font-display">
                        {coachBrand || coachName}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <WorkspaceSwitcher
                        variant="brand"
                        align="down"
                        currentLabel={currentWorkspaceLabel ?? ''}
                        workspaces={workspaces ?? []}
                    />
                    <NewsBellButton />
                    {pathname === '/coach/settings' && (
                        <button
                            type="button"
                            onClick={() => window.dispatchEvent(new CustomEvent('brand-tour-start'))}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="Ver guía del panel Mi Marca"
                            aria-label="Ver guía del panel Mi Marca"
                        >
                            <HelpCircle className="w-5 h-5" />
                        </button>
                    )}
                    <ThemeToggle />
                    <button type="button" onClick={handleSignOut} className="text-muted-foreground hover:text-destructive" aria-label="Cerrar sesión">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Navigation Sidebar (Desktop only — el mobile usa el bottom bar "4 + Más" más abajo) */}
            <aside className={cn(
                "hidden md:sticky md:top-0 md:flex md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar transition-all duration-300 [transform:translateZ(0)]",
                isBuilder
                    ? "md:h-full md:min-h-0 md:max-h-full supports-[height:100dvh]:md:h-full"
                    : "md:h-dvh supports-[height:100dvh]:md:h-[100dvh]",
                isCollapsed ? "md:w-20" : "md:w-64"
            )}>

                {/* Logo area (Desktop only) */}
                <div className={cn("hidden md:flex py-5 border-b border-sidebar-border items-center", isCollapsed ? "px-0 justify-center flex-col gap-4" : "px-6 justify-between")}>
                    <div className={cn("flex min-w-0 items-center gap-3", isCollapsed && "justify-center")}>
                        <EvaBrandIcon
                            className={cn('h-10 w-10 flex-shrink-0', isCollapsed && 'h-9 w-9')}
                        />
                        {!isCollapsed && (
                            <div className="min-w-0 animate-in fade-in duration-300">
                                <p className="text-sm font-bold text-sidebar-foreground truncate uppercase tracking-tight font-display">
                                    {coachBrand || coachName}
                                </p>
                                {enterpriseContext && (
                                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Gestionado por {enterpriseContext.orgName}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                    {!isCollapsed && (
                        <button
                            onClick={toggleSidebar}
                            aria-label="Contraer menú"
                            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
                        >
                            <PanelLeftClose className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {isCollapsed && (
                    <div className="hidden md:flex justify-center py-4 border-b border-sidebar-border">
                        <button
                            onClick={toggleSidebar}
                            aria-label="Expandir menú"
                            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground hover:text-sidebar-foreground transition-colors"
                        >
                            <PanelLeft className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {/* Navigation Links (Desktop) */}
                <div className="flex-1 min-h-0 overflow-visible">
                <nav className="flex max-w-none flex-1 min-h-0 flex-col justify-start gap-1 space-y-1 overflow-x-hidden overflow-y-auto px-4 py-3 custom-scrollbar">
                    {enterpriseContext && isOrgAdmin && (
                        <Link
                            href={`/org/${enterpriseContext.orgSlug}`}
                            prefetch={false}
                            title="Panel empresa"
                            className={cn(
                                'flex shrink-0 items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-sidebar-foreground transition-all duration-300 hover:bg-primary/15',
                                isCollapsed ? 'justify-center px-0' : 'justify-start'
                            )}
                            style={activeBgStyle}
                        >
                            <Building2
                                className="h-5 w-5 flex-shrink-0 text-primary"
                                style={activeColorStyle}
                            />
                            <span className={cn('truncate text-left', isCollapsed && 'hidden')}>Panel empresa</span>
                        </Link>
                    )}
                    {coreNavItems.map(renderNavLink)}
                    {hasModuleGroup && (
                        <>
                            {/* Divisor del grupo "MÓDULOS" — SOLO desktop (md:). En mobile el bottom
                                bar es plano [...core, ...modules]. NO es <a title> ⇒ no contamina
                                collectNavTitles de los specs E2E (aside nav a[title]). */}
                            <div
                                aria-hidden="true"
                                data-testid="nav-modules-divider"
                                className={cn(
                                    'hidden md:flex shrink-0 select-none flex-col gap-1 pt-2',
                                    isCollapsed ? 'items-center' : 'px-4'
                                )}
                            >
                                <div className="h-px w-full bg-sidebar-border" />
                                {!isCollapsed && (
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                                        Módulos
                                    </p>
                                )}
                            </div>
                            {moduleNavItems.map(renderNavLink)}
                        </>
                    )}
                </nav>
                </div>

                {/* Bottom area (Desktop only) */}
                <div className={cn("hidden md:flex flex-col border-t border-sidebar-border bg-sidebar-accent/50 dark:bg-black/50 backdrop-blur-xl", isCollapsed ? "p-4 space-y-6 items-center" : "px-4 py-3 space-y-2")}>
                    <div className={cn("flex items-center", isCollapsed ? "justify-center gap-4" : "justify-between px-2")}>
                        {!isCollapsed && (
                            <div className="flex flex-col">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Terminal</p>
                                <p className="text-xs text-sidebar-foreground font-medium truncate max-w-[120px]">{coachName}</p>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <NewsBellButton />
                            <ThemeToggle />
                        </div>
                    </div>

                    {!isCollapsed && (workspaces?.length ?? 0) > 1 && (
                        <div className="px-2 w-full">
                            <WorkspaceSwitcher
                                variant="brand"
                                align="up"
                                currentLabel={currentWorkspaceLabel ?? ''}
                                workspaces={workspaces ?? []}
                            />
                        </div>
                    )}

                    <button
                        onClick={handleSignOut}
                        title={isCollapsed ? "Cerrar sesión" : undefined}
                        className={cn(
                            "flex items-center rounded-xl text-[11px] uppercase tracking-widest font-bold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-300 group border border-transparent hover:border-destructive/20",
                            isCollapsed ? "justify-center w-12 h-12 p-0" : "w-full px-4 py-3 gap-3"
                        )}
                    >
                        <LogOut className="w-4 h-4 flex-shrink-0 transition-transform group-hover:-translate-x-1" />
                        {!isCollapsed && <span>Desconectar</span>}
                    </button>
                    {!isCollapsed && (
                        <a
                            href="mailto:privacidad@eva-app.cl"
                            className="block text-center text-[9px] text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors py-1"
                        >
                            Privacidad · ARCO
                        </a>
                    )}
                </div>
            </aside>

            {/* ============================ MOBILE BOTTOM BAR ============================ */}
            {/* Patrón nativo "4 primarios + Más" (espejo de CoachMobileChrome). Oculto en builder
                (evita doble barra fija) y en desktop (md:). Los chromes globales — news bell, theme,
                workspace switcher, sign-out — viven en el header mobile de arriba, sin duplicar. */}

            {/* Backdrop + panel "Más" (overflow) */}
            <AnimatePresence>
                {moreOpen && !isBuilder && (
                    <>
                        <motion.div
                            key="more-backdrop"
                            className="md:hidden fixed inset-0 z-[58] bg-black/40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.18 }}
                            onClick={() => setMoreOpen(false)}
                            aria-hidden="true"
                        />
                        <motion.div
                            key="more-panel"
                            role="dialog"
                            aria-label="Más opciones de navegación"
                            className="md:hidden fixed inset-x-0 bottom-0 z-[60] flex flex-col gap-1 rounded-t-2xl border-t border-sidebar-border bg-sidebar px-3 pt-3 pb-safe shadow-2xl"
                            initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                            exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                            transition={{ type: reduceMotion ? 'tween' : 'spring', duration: reduceMotion ? 0.18 : undefined, damping: 26, stiffness: 280 }}
                        >
                            <div className="mb-1 flex items-center justify-between px-2">
                                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Más</p>
                                <button
                                    type="button"
                                    onClick={() => setMoreOpen(false)}
                                    aria-label="Cerrar"
                                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 pb-1">
                                {mobileOverflow.map((item) => {
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
                                                'flex min-h-[44px] items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold transition-colors',
                                                isActive
                                                    ? 'bg-primary/10 border-primary/20 text-sidebar-foreground'
                                                    : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                                            )}
                                            style={isActive ? activeBgStyle : undefined}
                                        >
                                            <Icon
                                                className={cn('h-5 w-5 flex-shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')}
                                                style={isActive ? activeColorStyle : undefined}
                                            />
                                            <span className="truncate">{item.label}</span>
                                        </Link>
                                    )
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <nav
                aria-label="Navegación principal"
                className={cn(
                    'md:hidden fixed bottom-0 left-0 right-0 z-[59] flex items-stretch gap-0.5 border-t border-sidebar-border bg-sidebar px-1.5 pt-1.5 pb-safe pl-safe pr-safe shadow-2xl [transform:translateZ(0)]',
                    isBuilder && 'hidden'
                )}
            >
                {mobilePrimary.map((item) =>
                    renderMobileTile(
                        { key: item.key, label: item.label, short: item.shortLabel || item.label, icon: item.icon },
                        {
                            active: pathname === item.href || pathname.startsWith(item.href + '/'),
                            href: item.href,
                        }
                    )
                )}
                {hasMobileOverflow &&
                    renderMobileTile(
                        { key: 'more', label: 'Más', short: 'Más', icon: MoreHorizontal },
                        { active: isMoreActive || moreOpen, onClick: () => setMoreOpen((o) => !o) }
                    )}
            </nav>
        </>
    )
}

