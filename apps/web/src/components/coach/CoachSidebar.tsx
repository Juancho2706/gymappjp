'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
    House,
    Users,
    UsersRound,
    Dumbbell,
    Apple,
    ClipboardList,
    Utensils,
    Settings,
    Shield,
    LifeBuoy,
    HeartPulse,
    PersonStanding,
    LayoutDashboard,
    Building2,
    ChevronsLeft,
    ChevronsRight,
    type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { NavPendingFeedback } from '@/components/navigation/NavPendingFeedback'
import { ThemedLogo } from '@/components/brand/ThemedLogo'
import { CoachNavIcon, type CoachNavConcept } from '@/components/coach/CoachNavIcon'
import { EvaBrandIcon } from '@/components/landing/LandingBrandMark'
import { getVisibleNavItems, splitForSidebar, isNavItemActiveForPath, type NavModule } from '@eva/coach-nav'
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
    /** Logo de marca del coach — usado como imagen del avatar del pie (fallback iniciales). */
    logoUrl?: string | null
    /** Logo modo oscuro del coach; cae al claro si no existe. */
    logoUrlDark?: string | null
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
 * Etiquetas de display del diseño Claude (verbatim). La fuente de verdad de rutas/iconos/badges
 * sigue siendo `coach-nav.ts` (registro de módulos), pero el rótulo visible se fuerza al del diseño:
 * "Inicio" (no "Dashboard"), "Programas", "Nutrición", "Opciones", etc.
 */
const DISPLAY_LABELS: Record<string, string> = {
    dashboard: 'Inicio',
    clients: 'Alumnos',
    team: 'Equipo',
    programs: 'Programas',
    nutrition: 'Nutrición',
    options: 'Opciones',
    settings_team: 'Opciones',
    support: 'Soporte',
    cardio: 'Cardio',
    movement: 'Movimiento',
    reactivate: 'Reactivar',
}

/** Iconos del diseño Claude (verbatim): house / users / dumbbell / utensils / settings / shield / life-buoy. */
const ICON_OVERRIDE: Record<string, LucideIcon> = {
    dashboard: House,
    clients: Users,
    team: Shield,
    programs: Dumbbell,
    nutrition: Utensils,
    options: Settings,
    settings_team: Settings,
    support: LifeBuoy,
}

/**
 * Resolucion del icono string-key del registro (`@eva/coach-nav`, lucide-por-lado) a componente
 * lucide-react. Fallback cuando la key no tiene override de diseno (cardio/movement/reactivate).
 */
const ICON_BY_NAME: Record<string, LucideIcon> = {
    LayoutDashboard,
    Users,
    UsersRound,
    ClipboardList,
    Apple,
    Settings,
    LifeBuoy,
    HeartPulse,
    PersonStanding,
}

const displayLabel = (item: NavModule) => DISPLAY_LABELS[item.key] ?? item.label
const navIcon = (item: NavModule): LucideIcon => ICON_OVERRIDE[item.key] ?? ICON_BY_NAME[item.icon] ?? Settings

/** Capsula flotante movil — claves de los tabs PRIMARIOS (espejo del coachTabs del diseño eva-app). */
const MOBILE_TAB_KEYS = ['dashboard', 'clients', 'programs', 'nutrition', 'options', 'settings_team', 'team', 'reactivate'] as const

/**
 * Glifo propio (silueta del CEO) por clave de nav — SOLO para la cápsula móvil. Reemplaza al
 * icono lucide conservando tamaño/color por estado del call site. Las claves sin entrada
 * (p.ej. `reactivate`) caen al icono lucide (`navIcon`). El sidebar desktop NO usa este mapa.
 */
const MOBILE_GLYPH_BY_KEY: Record<string, CoachNavConcept> = {
    dashboard: 'home',
    clients: 'alumnos',
    programs: 'programas',
    nutrition: 'nutricion',
    options: 'ajustes',
    settings_team: 'ajustes',
    team: 'equipo',
}

export function CoachSidebar({ coachName, coachBrand, subscriptionStatus, enterpriseContext, activeWorkspaceType, enabledModules, disabledDomains, logoUrl, logoUrlDark }: CoachSidebarProps) {
    const pathname = usePathname()
    const [manualCollapsed, setManualCollapsed] = useState(false)
    // Modo "compact" del diseño (760 ≤ vw < 1080): el sidebar SIEMPRE es el rail de 76px;
    // el toggle manual solo manda en "wide" (≥1080). Espejo de eva-desktop
    // `collapsed = mode === 'compact' || (mode === 'wide' && sidebarCollapsed)`.
    const [isWide, setIsWide] = useState(true)
    // Cápsula móvil: hide-on-scroll-down / reveal-on-scroll-up → colapsa a pill icon-only
    // (TabBar.jsx `minimized`: insets 14→72, labels fade). El scroll vive en <main>
    // (overflow-y-auto), no en window.
    const [tabbarMinimized, setTabbarMinimized] = useState(false)
    // Pildora + pulso OPTIMISTAS del tap (espejo de ClientNav): feedback INMEDIATO en el ítem
    // tocado mientras el server stremea la ruta. `isNavigating` (href tocado) MANDA sobre
    // `pathname` para resolver el activo — la píldora salta al TAP, no al commit.
    const [isNavigating, setIsNavigating] = useState<string | null>(null)

    // Confirmación: la ruta cambió (commit) → limpiar pending (el activo vuelve a pathname).
    useEffect(() => {
        setIsNavigating(null)
    }, [pathname])

    // Revert: navegación fallida/colgada (offline, error de red) → soltar el pending para no
    // dejar píldora + overlay pegados en un ítem al que nunca se llegó.
    useEffect(() => {
        if (!isNavigating) return
        const t = setTimeout(() => setIsNavigating(null), 8000)
        return () => clearTimeout(t)
    }, [isNavigating])

    useEffect(() => {
        const saved = localStorage.getItem('sidebar-collapsed')
        if (saved === 'true') setManualCollapsed(true)
    }, [])

    useEffect(() => {
        const mq = window.matchMedia('(min-width: 1080px)')
        const apply = () => setIsWide(mq.matches)
        apply()
        mq.addEventListener('change', apply)
        return () => mq.removeEventListener('change', apply)
    }, [])

    const isCollapsed = !isWide || manualCollapsed

    useEffect(() => {
        // El scroll móvil ocurre en el documento (window), no en <main> (su alto no está
        // constreñido → el body crece y scrollea). Listener en window.
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
                    setTabbarMinimized(dy > 0 && y > 80)
                    lastY = y
                }
                ticking = false
            })
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [pathname])

    const toggleSidebar = () => {
        const newState = !manualCollapsed
        setManualCollapsed(newState)
        localStorage.setItem('sidebar-collapsed', String(newState))
    }

    const isBuilder = pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')
    const isOrgAdmin = enterpriseContext?.orgRole === 'org_owner' || enterpriseContext?.orgRole === 'org_admin'

    const disabledDomainSet = disabledDomains && disabledDomains.length > 0 ? new Set(disabledDomains) : null
    const visibleNavItems = getVisibleNavItems({ activeWorkspaceType, subscriptionStatus, enabledModules, disabledDomains: disabledDomainSet })
    const { primary: primaryNavItems } = splitForSidebar(visibleNavItems)

    // Item-aware: además de `href` respeta `activeAliases` (swap V2 bajo canary ilumina Nutrición).
    // Con pending activo, el ítem tocado es EL ÚNICO activo (pendingHref ?? pathname). El OR
    // anterior dejaba TAMBIÉN activo el de la ruta actual → el findIndex de la píldora móvil
    // devolvía el VIEJO si venía antes en la lista y la píldora no saltaba hasta el commit.
    const isNavItemActive = (item: NavModule) =>
        isNavigating != null ? isNavigating === item.href : isNavItemActiveForPath(item, pathname)

    // MOBILE — cápsula flotante (eva-app coachTabs): hasta 5 tabs full-label, sin "Más".
    const mobileTabs = MOBILE_TAB_KEYS
        .map((k) => visibleNavItems.find((i) => i.key === k))
        .filter((i): i is NavModule => i != null)
        .slice(0, 5)
    const mobileActiveIndex = mobileTabs.findIndex((i) => isNavItemActive(i))
    const mobileN = mobileTabs.length || 1

    // DESKTOP — link vertical del sidebar (.dt-nav-item). Transcripción verbatim del diseño.
    const renderNavLink = (item: NavModule, secondary = false) => {
        const isActive = isNavItemActive(item)
        const Icon = navIcon(item)
        const label = displayLabel(item)
        return (
            <Link
                key={item.href}
                href={item.href}
                // Prefetch DEFAULT (auto) de Next — espejo de ClientNav. Es seguro y barato acá:
                // (1) el matcher del proxy EXCLUYE los prefetch de /coach/* via `missing`
                //     (next-router-prefetch / purpose:prefetch) → el bundle de auth/workspace/
                //     coaches NO corre en prefetch (src/proxy.ts, entry 2 del matcher);
                // (2) en rutas dinámicas el prefetch solo baja el árbol hasta el loading.tsx del
                //     segmento (los 5 ítems del menú lo tienen) — sin data de página, una vez por
                //     sesión (cache de prefetch del router). El tap pinta el skeleton al instante.
                title={isCollapsed ? label : undefined}
                aria-label={label}
                onClick={() => {
                    if (!isNavItemActiveForPath(item, pathname)) setIsNavigating(item.href)
                }}
                className={cn(
                    'group/navitem relative flex w-full items-center gap-[13px] rounded-[var(--radius-md)] border-none font-ui text-[14.5px] font-semibold tracking-[-0.01em] text-left transition-colors duration-150',
                    secondary ? 'h-[42px]' : 'h-[46px]',
                    isCollapsed ? 'mx-auto h-12 w-12 justify-center gap-0 px-0' : 'px-3',
                    isActive
                        ? 'bg-[var(--sport-100)] text-[var(--sport-600)] [font-weight:750]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-strong)]',
                    isNavigating === item.href && 'animate-pulse'
                )}
            >
                {/* .dt-nav-accent — barra lateral sport del activo */}
                <span
                    aria-hidden="true"
                    className={cn(
                        'pointer-events-none absolute top-1/2 w-[3px] -translate-y-1/2 rounded-r-[3px] bg-[var(--sport-500)] transition-[height] duration-[180ms] ease-[cubic-bezier(.22,1,.36,1)]',
                        isCollapsed ? 'left-[-12px]' : 'left-[-14px]',
                        isActive ? 'h-[22px]' : 'h-0'
                    )}
                />
                <span className="inline-flex h-[23px] w-[23px] flex-shrink-0 items-center justify-center">
                    <Icon size={22} />
                </span>
                <span className={cn('overflow-hidden whitespace-nowrap', isCollapsed && 'hidden')}>
                    {label}
                </span>
            </Link>
        )
    }

    // Avatar del pie = el coach (no la marca): el panel /coach es la cara de EVA.
    const avatarName = coachName?.trim() || coachBrand?.trim() || 'Coach'

    return (
        <>
            {/* Feedback de contenido INSTANTÁNEO del tap: barra 2px sport + atenuar <main>.
                Vive mientras pathname != href tocado; el loading.tsx del server lo reemplaza. */}
            {isNavigating != null && <NavPendingFeedback color="var(--sport-500)" />}

            {/* ===================== DESKTOP SIDEBAR (.dt-side) ===================== */}
            <aside
                className={cn(
                    'hidden transition-[width,padding] duration-[240ms] ease-[cubic-bezier(.22,1,.36,1)] md:sticky md:top-0 md:z-[6] md:flex md:flex-col md:border-r md:border-[var(--border-subtle)] md:bg-[var(--surface-app)]',
                    isBuilder
                        ? 'md:h-full md:max-h-full md:min-h-0'
                        : 'md:h-dvh supports-[height:100dvh]:md:h-[100dvh]',
                    isCollapsed ? 'md:w-[76px] md:px-3 md:pb-[14px] md:pt-[18px]' : 'md:w-[248px] md:px-[14px] md:pb-[14px] md:pt-[18px]'
                )}
            >
                {/* .dt-side-brand */}
                <div
                    className={cn(
                        'mb-5 flex h-10 items-center',
                        isCollapsed ? 'justify-center pl-0' : 'pl-2'
                    )}
                >
                    {/* Identidad EVA (no la marca del coach): el panel /coach es la cara de EVA —
                        la marca blanca del coach solo aparece en la app del alumno (/c). El diseño
                        eva-desktop muestra el logo EVA en el sidebar del coach. */}
                    <EvaBrandIcon className={cn('flex-shrink-0', isCollapsed ? 'h-10 w-10' : 'h-9 w-9')} />
                    {!isCollapsed && (
                        <div className="ml-2.5 min-w-0">
                            <p className="truncate font-display text-[15px] font-black uppercase leading-none tracking-tight text-[var(--text-strong)]">
                                EVA
                            </p>
                            {enterpriseContext && (
                                <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                    Gestionado por {enterpriseContext.orgName}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* .dt-nav */}
                <nav className="flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto" aria-label="Navegación principal">
                    {enterpriseContext && isOrgAdmin && (
                        <Link
                            href={`/org/${enterpriseContext.orgSlug}`}
                            prefetch={false}
                            title={isCollapsed ? 'Panel empresa' : undefined}
                            aria-label="Panel empresa"
                            className={cn(
                                'relative flex w-full items-center gap-[13px] rounded-[var(--radius-md)] bg-[var(--sport-100)] font-ui text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--sport-600)] transition-colors duration-150',
                                isCollapsed ? 'mx-auto h-12 w-12 justify-center gap-0 px-0' : 'h-[46px] px-3'
                            )}
                        >
                            <span className="inline-flex h-[23px] w-[23px] flex-shrink-0 items-center justify-center">
                                <Building2 size={22} />
                            </span>
                            <span className={cn('overflow-hidden whitespace-nowrap', isCollapsed && 'hidden')}>Panel empresa</span>
                        </Link>
                    )}
                    {primaryNavItems.map((item) => renderNavLink(item))}
                </nav>

                {/* .dt-side-foot — bloque COACH / {nombre} + Colapsar menú */}
                <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--border-subtle)] pt-3">
                    <div className={cn('flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] p-1.5', isCollapsed && 'justify-center p-0')}>
                        {logoUrl ? (
                            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-subtle bg-white dark:bg-[var(--surface-sunken)]">
                                <ThemedLogo light={logoUrl} dark={logoUrlDark} alt={avatarName} fill sizes="32px" className="object-contain p-1" />
                            </span>
                        ) : (
                            <Avatar name={avatarName} size="sm" />
                        )}

                        {!isCollapsed && (
                            <span className="flex min-w-0 flex-col gap-px">
                                <span className="truncate text-[10px] font-bold uppercase leading-[1.2] tracking-[0.07em] text-[var(--text-subtle)]">
                                    Coach
                                </span>
                                <span className="truncate text-[13px] font-bold leading-[1.25] text-[var(--text-strong)]">
                                    {coachName}
                                </span>
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={toggleSidebar}
                        aria-label={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                        title={isCollapsed ? 'Expandir' : 'Colapsar'}
                        className={cn(
                            'flex h-[38px] items-center gap-2.5 rounded-[var(--radius-md)] font-ui text-[12.5px] font-[650] text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-body)]',
                            isCollapsed ? 'mx-auto w-12 justify-center px-0' : 'w-full px-3'
                        )}
                    >
                        <span className="inline-flex h-[23px] w-[23px] flex-shrink-0 items-center justify-center">
                            {isCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
                        </span>
                        {!isCollapsed && <span>Colapsar menú</span>}
                    </button>
                </div>
            </aside>

            {/* ===================== MOBILE FLOATING CAPSULE (TabBar floating) ===================== */}
            {/* Cápsula flotante de vidrio esmerilado — transcripción verbatim de TabBar.jsx (floating).
                Oculta en builder (full-screen) y en desktop (md:). El header lo renderiza cada pantalla. */}
            {!isBuilder && (
                <nav
                    aria-label="Navegación principal"
                    className="flex md:hidden"
                    style={{
                        position: 'fixed',
                        left: tabbarMinimized ? 72 : 14,
                        right: tabbarMinimized ? 72 : 14,
                        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
                        zIndex: 50,
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
                    {/* indicador deslizante sport */}
                    <span
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            top: 8,
                            bottom: 8,
                            left: `calc(8px + ${mobileActiveIndex < 0 ? 0 : mobileActiveIndex} * ((100% - 16px) / ${mobileN}))`,
                            width: `calc((100% - 16px) / ${mobileN})`,
                            borderRadius: 22,
                            background: 'color-mix(in srgb, var(--sport-500) 15%, transparent)',
                            border: '1px solid color-mix(in srgb, var(--sport-500) 24%, transparent)',
                            transition: 'left var(--dur-slow) var(--ease-spring)',
                            pointerEvents: 'none',
                            zIndex: 0,
                            opacity: mobileActiveIndex < 0 ? 0 : 1,
                        }}
                    />
                    {mobileTabs.map((item) => {
                        const active = isNavItemActive(item)
                        const Icon = navIcon(item)
                        const glyph = MOBILE_GLYPH_BY_KEY[item.key]
                        const label = displayLabel(item)
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                // Prefetch default (auto): baja solo hasta el loading.tsx del
                                // segmento y el proxy excluye prefetch de /coach — ver nota en
                                // renderNavLink. Tap → skeleton al instante.
                                aria-label={label}
                                onClick={() => {
                                    if (!isNavItemActiveForPath(item, pathname)) setIsNavigating(item.href)
                                }}
                                className={cn('eva-tabbar-press', isNavigating === item.href && 'animate-pulse')}
                                style={{
                                    position: 'relative',
                                    zIndex: 1,
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: tabbarMinimized ? 0 : 3,
                                    padding: tabbarMinimized ? '5px 0' : '6px 0',
                                    border: 'none',
                                    background: 'transparent',
                                    color: active ? 'var(--sport-600)' : 'var(--ink-400)',
                                    textDecoration: 'none',
                                    WebkitTapHighlightColor: 'transparent',
                                    transition:
                                        'color var(--dur-base) var(--ease-out), padding var(--dur-base) var(--ease-out)',
                                }}
                            >
                                <span
                                    className={cn(
                                        'inline-flex h-6 w-6 items-center justify-center',
                                        // El fill-current es un truco para el trazo lucide del activo;
                                        // los glifos ya son siluetas rellenas (heredan `color`).
                                        active && !glyph && '[&_svg]:fill-current [&_svg]:[fill-opacity:0.18]'
                                    )}
                                    style={{ transform: active ? 'translateY(-1px)' : 'none', transition: 'transform var(--dur-base) var(--ease-spring)' }}
                                >
                                    {glyph ? <CoachNavIcon concept={glyph} className="h-6 w-6" /> : <Icon size={24} />}
                                </span>
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: active ? 800 : 600,
                                        letterSpacing: '0.01em',
                                        maxHeight: tabbarMinimized ? 0 : 14,
                                        opacity: tabbarMinimized ? 0 : 1,
                                        overflow: 'hidden',
                                        transition:
                                            'max-height var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
                                    }}
                                >
                                    {label}
                                </span>
                            </Link>
                        )
                    })}
                </nav>
            )}
        </>
    )
}
