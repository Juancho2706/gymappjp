'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NewsBellButton } from '@/components/coach/NewsBellButton'

/**
 * CoachTopBar — barra superior de escritorio del panel /coach (Fase 2, net-new).
 *
 * SOLO escritorio (`hidden md:flex`): por debajo de `md` el chrome móvil vive en
 * `CoachSidebar` (header móvil fijo + bottom bar). Contenido mínimo:
 *  1. Breadcrumb/sección derivado de `usePathname()` — el 2º crumb aparece solo en
 *     drill-down (ej. `/coach/clients/[id]`).
 *  2. Búsqueda global = placeholder estilizado NO funcional (el real necesita endpoint;
 *     follow-up al ⌘K del directorio). No cablea data.
 *  3. Campana = se REUSA `NewsBellButton` (consume `NewsFeedProvider`, cero data nueva).
 *  4. Avatar de cuenta → `/coach/settings` (inicial de la marca/nombre del coach).
 *
 * Devuelve `null` en el builder (full-screen sin chrome global), igual que los guards
 * `isBuilder` del sidebar.
 *
 * Props serializables (resueltas en el server layout). NO recibe data sensible: el
 * branding ya llega aplicado vía los tokens `--sport-*`/`--theme-primary` del `<style>`
 * inline del layout, así que `bg-sport-500` y `primaryColor` ya son el color de marca.
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
    // Prefijo más largo que matchee la ruta actual.
    let best = FALLBACK_SECTION as { prefix: string; label: string; detail: string }
    for (const s of SECTIONS) {
        if (
            (pathname === s.prefix || pathname.startsWith(s.prefix + '/')) &&
            s.prefix.length > best.prefix.length
        ) {
            best = s
        }
    }
    // El 2º crumb (detalle) solo en drill-down: hay segmento más profundo que la raíz de sección.
    const isDrillDown = pathname.startsWith(best.prefix + '/')
    return {
        sectionLabel: best.label,
        sectionHref: best.prefix,
        detailLabel: isDrillDown ? best.detail : null,
    }
}

export function CoachTopBar({ coachName, coachBrand, primaryColor }: CoachTopBarProps) {
    const pathname = usePathname()

    // Builder = full-screen sin chrome global (espejo de `isBuilder` en CoachSidebar).
    if (pathname.startsWith('/coach/builder') || pathname.startsWith('/coach/workout-programs/builder')) {
        return null
    }

    const { sectionLabel, sectionHref, detailLabel } = resolveCrumb(pathname)
    const initial = (coachBrand?.trim() || coachName?.trim() || 'C').charAt(0).toUpperCase()

    return (
        <header className="hidden md:flex h-14 shrink-0 items-center gap-3 border-b border-border-subtle bg-surface-card px-5 font-ui">
            {/* Breadcrumb / sección */}
            <nav aria-label="Ruta" className="flex min-w-0 flex-1 items-center gap-1.5">
                {detailLabel ? (
                    <>
                        <Link
                            href={sectionHref}
                            prefetch={false}
                            className="truncate text-sm font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-strong)]"
                        >
                            {sectionLabel}
                        </Link>
                        <ChevronRight
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
                        />
                        <span className="truncate text-sm font-semibold text-[var(--text-strong)]">
                            {detailLabel}
                        </span>
                    </>
                ) : (
                    <h1 className="truncate font-display text-base font-bold tracking-tight text-[var(--text-strong)]">
                        {sectionLabel}
                    </h1>
                )}
            </nav>

            {/* Búsqueda global — placeholder NO funcional (follow-up: endpoint real ⌘K). */}
            <div
                className="hidden h-9 w-64 shrink-0 items-center gap-2 rounded-control border border-border-subtle bg-surface-app px-3 lg:flex"
                aria-hidden="true"
            >
                <Search className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <input
                    type="text"
                    readOnly
                    tabIndex={-1}
                    placeholder="Buscar alumno o programa…"
                    className="w-full bg-transparent text-sm text-[var(--text-body)] placeholder:text-[var(--text-muted)] focus:outline-none"
                />
            </div>

            {/* Acciones: campana (reusada) + cuenta */}
            <div className="flex shrink-0 items-center gap-1.5 pl-1">
                <div className="flex h-9 w-9 items-center justify-center rounded-control text-[var(--text-muted)] transition-colors hover:bg-surface-sunken hover:text-[var(--text-strong)]">
                    <NewsBellButton />
                </div>
                <Link
                    href="/coach/settings"
                    prefetch={false}
                    aria-label="Tu cuenta"
                    title={coachBrand || coachName}
                    className="flex items-center"
                >
                    <span
                        className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-pill font-display text-xs font-bold text-[var(--text-on-sport,#fff)]',
                            !primaryColor && 'bg-sport-500'
                        )}
                        style={primaryColor ? { backgroundColor: primaryColor } : undefined}
                    >
                        {initial}
                    </span>
                </Link>
            </div>
        </header>
    )
}
