'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { ChevronRight, ArrowLeft, Table2, PanelLeft, ChevronsUpDown, Sun, Moon, LogOut, Loader2 } from 'lucide-react'
import { NewsBellButton } from '@/components/coach/NewsBellButton'
import { CoachGlobalSearch } from '@/components/coach/CoachGlobalSearch'
import { useRosterView } from '@/components/coach/RosterViewContext'
import { useCoachSignOut } from '@/app/coach/settings/_components/CoachSignOut'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { WorkspaceSummary } from '@/domain/auth/types'

/**
 * CoachTopBar — barra superior de escritorio del panel /coach (.dt-topbar del diseño Claude).
 *
 * SOLO escritorio (`hidden md:flex`): por debajo de `md` el chrome lo renderiza cada pantalla
 * (header propio) + la cápsula flotante de navegación de `CoachSidebar`.
 *
 * Layout (verbatim del diseño):
 *  - Izquierda (`.dt-tb-left`): back + breadcrumb "Sección › Detalle", SOLO en drill-down.
 *  - Centro (`.dt-tb-search`): búsqueda global centrada "Buscar alumno o programa…  (/)"
 *    (placeholder NO funcional — endpoint real es follow-up).
 *  - Derecha (`.dt-tb-actions`): campana (NewsBellButton, con badge) + avatar de cuenta → /coach/settings.
 *
 * Devuelve `null` en el builder (full-screen sin chrome global). El branding ya llega aplicado vía
 * los tokens `--sport-*` rebindeados en el `<style>` del layout, así que `var(--sport-*)` ya es marca.
 */
export interface CoachTopBarProps {
    coachName: string
    coachBrand: string
    primaryColor?: string
    /** Logo de marca del coach — imagen del avatar de cuenta (fallback iniciales). */
    logoUrl?: string | null
    /** Workspaces del usuario. Con más de uno se muestra el chevron ↕ → /workspace/select. */
    workspaces?: WorkspaceSummary[]
    /** Etiqueta del workspace activo (tooltip del avatar cuando hay multi-workspace). */
    currentWorkspaceLabel?: string
}

/**
 * Mapa sección → etiqueta + etiqueta de detalle (2º crumb). Match por prefijo MÁS LARGO.
 * Rutas existentes (no se inventan): espejo del registro `coach-nav.ts`.
 */
const SECTIONS: ReadonlyArray<{ prefix: string; label: string; detail: string }> = [
    { prefix: '/coach/dashboard', label: 'Inicio', detail: 'Detalle' },
    { prefix: '/coach/clients', label: 'Alumnos', detail: 'Perfil del alumno' },
    { prefix: '/coach/workout-programs', label: 'Programas', detail: 'Programa' },
    { prefix: '/coach/nutrition-plans', label: 'Nutrición', detail: 'Plan' },
    { prefix: '/coach/settings', label: 'Opciones', detail: 'Ajustes' },
    { prefix: '/coach/support', label: 'Soporte', detail: 'Detalle' },
    { prefix: '/coach/team', label: 'Equipo', detail: 'Detalle' },
    { prefix: '/coach/cardio', label: 'Cardio', detail: 'Detalle' },
    { prefix: '/coach/movement', label: 'Movimiento', detail: 'Detalle' },
    { prefix: '/coach/reactivate', label: 'Reactivar', detail: 'Detalle' },
]

const FALLBACK_SECTION = { prefix: '/coach/dashboard', label: 'Panel', detail: 'Detalle' } as const

function resolveCrumb(pathname: string): { sectionLabel: string; sectionHref: string; detailLabel: string | null } {
    let best = FALLBACK_SECTION as { prefix: string; label: string; detail: string }
    for (const s of SECTIONS) {
        if (
            (pathname === s.prefix || pathname.startsWith(s.prefix + '/')) &&
            s.prefix.length > best.prefix.length
        ) {
            best = s
        }
    }
    const isDrillDown = pathname.startsWith(best.prefix + '/')
    return {
        sectionLabel: best.label,
        sectionHref: best.prefix,
        detailLabel: isDrillDown ? best.detail : null,
    }
}

/**
 * Toggle segmentado Tabla / Ficha — transcripción del `.dt-viewtoggle` del diseño (slot
 * `viewToggle` del DesktopTopBar). Vive en el topbar, ENTRE la búsqueda centrada y las
 * acciones (campana + avatar). Solo desktop (el topbar ya es `hidden md:flex`).
 */
function RosterViewToggle({
    value,
    onChange,
}: {
    value: 'ficha' | 'tabla'
    onChange: (m: 'ficha' | 'tabla') => void
}) {
    return (
        <div className="flex flex-shrink-0 gap-0.5 rounded-control bg-surface-sunken p-[3px]">
            <button
                type="button"
                onClick={() => onChange('tabla')}
                className={cn(
                    'inline-flex h-[30px] items-center gap-1.5 rounded-[calc(var(--radius-control)-3px)] px-3 text-[13px] font-bold transition-colors',
                    value === 'tabla'
                        ? 'bg-surface-card text-sport-600 shadow-[var(--shadow-xs)]'
                        : 'text-muted hover:text-strong'
                )}
            >
                <Table2 className="h-[15px] w-[15px]" />
                Tabla
            </button>
            <button
                type="button"
                onClick={() => onChange('ficha')}
                className={cn(
                    'inline-flex h-[30px] items-center gap-1.5 rounded-[calc(var(--radius-control)-3px)] px-3 text-[13px] font-bold transition-colors',
                    value === 'ficha'
                        ? 'bg-surface-card text-sport-600 shadow-[var(--shadow-xs)]'
                        : 'text-muted hover:text-strong'
                )}
            >
                <PanelLeft className="h-[15px] w-[15px]" />
                Ficha
            </button>
        </div>
    )
}

/** Clases del botón-icono del topbar — calca la cápsula de la campana (NewsBellButton wrapper). */
const TOPBAR_ICON_BTN =
    'flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-strong)]'

/**
 * Switcher claro/oscuro — usa el mecanismo de tema existente (next-themes, `attribute="class"`
 * montado en el layout raíz, `enableSystem={false}` → `resolvedTheme` es 'light' | 'dark').
 * Guard `mounted` para evitar mismatch de hidratación (el server renderiza el tema por defecto).
 * Desktop-only por vivir dentro del topbar (`hidden md:flex`).
 */
function ThemeToggleButton() {
    const { resolvedTheme, setTheme } = useTheme()
    const [mounted, setMounted] = useState(false)
    useEffect(() => setMounted(true), [])
    const isDark = mounted && resolvedTheme === 'dark'
    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={isDark ? 'Modo claro' : 'Modo oscuro'}
            className={TOPBAR_ICON_BTN}
        >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
    )
}

/** Cerrar sesión — reusa `useCoachSignOut` (supabase.auth.signOut + push a /login). */
function TopBarLogoutButton() {
    const { signOut, pending } = useCoachSignOut()
    return (
        <button
            type="button"
            onClick={signOut}
            disabled={pending}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className={cn(TOPBAR_ICON_BTN, 'disabled:opacity-60')}
        >
            {pending ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
        </button>
    )
}

export function CoachTopBar({ coachName, coachBrand, logoUrl, workspaces, currentWorkspaceLabel }: CoachTopBarProps) {
    const pathname = usePathname()
    const inputRef = useRef<HTMLInputElement>(null)
    // Toggle Tabla/Ficha: solo se muestra mientras /coach/clients está montado (active).
    const { active: rosterActive, mode: rosterMode, setMode: setRosterMode } = useRosterView()

    // Atajo de teclado desktop (.dt-tb-input): "/" enfoca la búsqueda global, salvo si el foco
    // ya está en un campo editable. Verbatim del DesktopTopBar del diseño.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            const tag = t?.tagName ?? ''
            if (e.key === '/' && !/^(input|textarea|select)$/i.test(tag) && !t?.isContentEditable) {
                e.preventDefault()
                inputRef.current?.focus()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])

    // Builder = full-screen sin chrome global (espejo de `isBuilder` en CoachSidebar).
    if (pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')) {
        return null
    }

    const { sectionLabel, sectionHref, detailLabel } = resolveCrumb(pathname)
    const inStack = detailLabel != null
    // Avatar de cuenta = el coach (no la marca): el panel es la cara de EVA.
    const avatarName = coachName?.trim() || coachBrand?.trim() || 'Coach'
    // Multi-workspace ⇒ el avatar lleva chevron ↕ y navega al selector (misma condición y
    // destino que post-login-redirect: workspaces.length > 1 → /workspace/select).
    const hasMultiWorkspace = (workspaces?.length ?? 0) > 1

    return (
        <header className="z-[4] hidden h-[60px] flex-shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-app)] px-[22px] font-ui md:flex">
            {/* .dt-tb-left — back + breadcrumb (solo en drill-down) */}
            <div className="flex min-w-0 flex-shrink-0 items-center gap-2.5">
                {inStack && (
                    <>
                        <Link
                            href={sectionHref}
                            prefetch={false}
                            aria-label="Volver"
                            title="Volver"
                            className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-sunken)] text-[var(--text-strong)] transition-colors hover:bg-[var(--ink-100)]"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <nav aria-label="Ruta" className="flex min-w-0 items-center gap-[7px]">
                            <Link
                                href={sectionHref}
                                prefetch={false}
                                className="whitespace-nowrap text-[14.5px] font-bold text-[var(--text-subtle)] transition-colors hover:text-[var(--text-strong)]"
                            >
                                {sectionLabel}
                            </Link>
                            <span aria-hidden="true" className="inline-flex text-[var(--ink-300)]">
                                <ChevronRight size={14} />
                            </span>
                            <span className="max-w-[240px] truncate text-[14.5px] font-bold text-[var(--text-strong)]">
                                {detailLabel}
                            </span>
                        </nav>
                    </>
                )}
            </div>

            {/* .dt-tb-search — búsqueda global centrada. El chrome 1:1 (input enfocable con "/",
                Escape limpia/desenfoca, botón × y anillo de foco sport) vive ahora en
                CoachGlobalSearch, que además monta el dropdown de resultados agrupados
                (Alumnos/Programas/Ejercicios/Recetas) contra GET /api/coach/search. El atajo "/"
                sigue enfocando este input vía el inputRef compartido. */}
            <CoachGlobalSearch inputRef={inputRef} />

            {/* .dt-viewtoggle — toggle Tabla/Ficha, solo en /coach/clients. Entre la
                búsqueda centrada y las acciones (igual que el slot viewToggle del diseño). */}
            {rosterActive && (
                <RosterViewToggle value={rosterMode} onChange={setRosterMode} />
            )}

            {/* .dt-tb-actions — switcher tema + logout + campana (reusada) + cuenta */}
            <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                <ThemeToggleButton />
                <TopBarLogoutButton />
                <div className="relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-strong)]">
                    <NewsBellButton />
                </div>
                <Link
                    href={hasMultiWorkspace ? '/workspace/select' : '/coach/settings'}
                    prefetch={false}
                    aria-label={hasMultiWorkspace ? 'Cambiar workspace' : 'Tu cuenta'}
                    title={
                        hasMultiWorkspace
                            ? (currentWorkspaceLabel || coachBrand || coachName)
                            : (coachBrand || coachName)
                    }
                    className={cn(
                        'flex h-10 items-center rounded-full transition-colors hover:bg-[var(--surface-sunken)]',
                        hasMultiWorkspace
                            ? 'gap-1 rounded-[var(--radius-md)] pl-1 pr-1.5'
                            : 'w-10 justify-center'
                    )}
                >
                    {logoUrl ? (
                        <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-subtle bg-white dark:bg-[var(--surface-sunken)]">
                            <Image src={logoUrl} alt={avatarName} fill sizes="32px" className="object-contain p-1" />
                        </span>
                    ) : (
                        <Avatar name={avatarName} size="sm" />
                    )}
                    {hasMultiWorkspace && (
                        <ChevronsUpDown
                            className="h-3.5 w-3.5 flex-shrink-0 text-[var(--text-subtle)]"
                            aria-hidden="true"
                        />
                    )}
                </Link>
            </div>
        </header>
    )
}
