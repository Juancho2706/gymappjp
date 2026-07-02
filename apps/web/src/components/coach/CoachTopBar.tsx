'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, ChevronRight, ArrowLeft, X, Table2, PanelLeft } from 'lucide-react'
import { NewsBellButton } from '@/components/coach/NewsBellButton'
import { useRosterView } from '@/components/coach/RosterViewContext'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

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

export function CoachTopBar({ coachName, coachBrand }: CoachTopBarProps) {
    const pathname = usePathname()
    const inputRef = useRef<HTMLInputElement>(null)
    const [query, setQuery] = useState('')
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

    return (
        <header className="z-[4] hidden h-[60px] flex-shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-[22px] font-ui md:flex">
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

            {/* .dt-tb-search — búsqueda global centrada. Chrome 1:1: input enfocable con "/",
                Escape limpia/desenfoca, botón × para limpiar y anillo de foco sport (.dt-tb-input:focus).
                DIFERIDO a la ola de datos: el dropdown de resultados agrupados
                (Alumnos/Programas/Ejercicios/Recetas) requiere endpoints reales de búsqueda. */}
            <div className="relative mx-auto flex max-w-[460px] flex-1 items-center">
                <span className="pointer-events-none absolute left-3 inline-flex text-[var(--text-subtle)]">
                    <Search size={17} />
                </span>
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setQuery('')
                            e.currentTarget.blur()
                        }
                    }}
                    placeholder="Buscar alumno o programa…  (/)"
                    aria-label="Buscar alumno o programa"
                    className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] pl-[38px] pr-[34px] text-sm text-[var(--text-strong)] outline-none transition-[border-color,background,box-shadow] duration-150 placeholder:text-[var(--text-subtle)] focus:border-[var(--sport-500)] focus:bg-[var(--surface-card)] focus:shadow-[var(--ring-focus)] [&::-webkit-search-cancel-button]:appearance-none"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => {
                            setQuery('')
                            inputRef.current?.focus()
                        }}
                        aria-label="Limpiar"
                        className="absolute right-2 flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-strong)]"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* .dt-viewtoggle — toggle Tabla/Ficha, solo en /coach/clients. Entre la
                búsqueda centrada y las acciones (igual que el slot viewToggle del diseño). */}
            {rosterActive && (
                <RosterViewToggle value={rosterMode} onChange={setRosterMode} />
            )}

            {/* .dt-tb-actions — campana (reusada) + cuenta */}
            <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-strong)]">
                    <NewsBellButton />
                </div>
                <Link
                    href="/coach/settings"
                    prefetch={false}
                    aria-label="Tu cuenta"
                    title={coachBrand || coachName}
                    className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--surface-sunken)]"
                >
                    <Avatar name={avatarName} size="sm" />
                </Link>
            </div>
        </header>
    )
}
