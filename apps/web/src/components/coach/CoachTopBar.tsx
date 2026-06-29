'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, ChevronRight, ArrowLeft } from 'lucide-react'
import { NewsBellButton } from '@/components/coach/NewsBellButton'

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

export function CoachTopBar({ coachName, coachBrand }: CoachTopBarProps) {
    const pathname = usePathname()

    // Builder = full-screen sin chrome global (espejo de `isBuilder` en CoachSidebar).
    if (pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')) {
        return null
    }

    const { sectionLabel, sectionHref, detailLabel } = resolveCrumb(pathname)
    const inStack = detailLabel != null
    const initial = (coachBrand?.trim() || coachName?.trim() || 'C').charAt(0).toUpperCase()

    return (
        <header className="hidden h-[60px] flex-shrink-0 items-center gap-4 border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-[22px] font-ui md:flex">
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

            {/* .dt-tb-search — búsqueda global centrada (placeholder NO funcional) */}
            <div className="relative mx-auto flex max-w-[460px] flex-1 items-center">
                <span className="pointer-events-none absolute left-3 inline-flex text-[var(--text-subtle)]">
                    <Search size={17} />
                </span>
                <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    placeholder="Buscar alumno o programa…  (/)"
                    aria-hidden="true"
                    className="h-10 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)] pl-[38px] pr-[34px] text-sm text-[var(--text-strong)] outline-none placeholder:text-[var(--text-subtle)]"
                />
            </div>

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
                    <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[var(--sport-500)] font-display text-sm font-bold text-[var(--text-on-sport,#fff)]">
                        {initial}
                    </span>
                </Link>
            </div>
        </header>
    )
}
