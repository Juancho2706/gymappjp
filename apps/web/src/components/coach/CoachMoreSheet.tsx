'use client'

import Link from 'next/link'
import {
    Apple,
    ChevronRight,
    Dumbbell,
    HeartPulse,
    LifeBuoy,
    PersonStanding,
    Settings,
    SlidersHorizontal,
    UsersRound,
    type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CoachNavIcon, type CoachNavConcept } from '@/components/coach/CoachNavIcon'
import { cn } from '@/lib/utils'
import { groupNavItems, isNavItemActiveForPath, type NavModule } from '@eva/coach-nav'

/**
 * Hoja «Más» de la cápsula móvil WEB (Ola de orden W2.6, decisiones 2A/3A del owner).
 *
 * Gemela de la pantalla `app/coach/(tabs)/more.tsx` de RN: MISMO copy, MISMAS secciones, MISMOS
 * subtítulos. Lo que cambia es el chasis (allá es un TAB de Expo Router, acá un bottom sheet), y
 * eso es a propósito: en la PWA la cápsula flota sobre el contenido, no reemplaza el stack.
 *
 * Contenido = el `overflow` de `buildMobileBar` (@eva/coach-nav), o sea todo lo que el coach TIENE
 * VISIBLE y no entró en los 5 slots de la barra. Hasta W2.5 ese sobrante no existía en la web: el
 * `.slice(0, 5)` sobre una lista fija de claves que tenía `CoachSidebar` lo tiraba en silencio y
 * en responsive un coach solo veía «Opciones» (hallazgo del QA del owner, 01-09).
 *
 * Solo VISIBILIDAD: acá no se autoriza nada. Un dominio apagado ni siquiera llega al `overflow`, y
 * su ruta redirige igual server-side (W1.4a). Sección sin filas ⇒ no se pinta (tampoco su
 * encabezado), mismo criterio que el sidebar de W2.4 y que la hoja de RN.
 */

/**
 * Glifo propio (silueta del CEO) por clave, espejo del `NAV_GLYPH_BY_KEY` de `CoachSidebar`: las
 * filas de la hoja tienen que verse como los ítems del sidebar y de la cápsula, no como un set de
 * íconos aparte. Las claves sin glifo caen al mapa lucide de abajo.
 */
const ROW_GLYPH_BY_KEY: Record<string, CoachNavConcept> = {
    programs: 'programas',
    nutrition: 'nutricion',
    team: 'equipo',
    options: 'ajustes',
    settings_team: 'ajustes',
    movement: 'movimiento',
}

/**
 * Fallback lucide por clave (las que no tienen glifo propio: Cardio, Funciones, Soporte) y red
 * para cualquier entrada futura del registro que caiga al overflow. Se declara completo a
 * propósito: si mañana se retira un PNG del set, la fila sigue teniendo ícono.
 */
const ROW_ICON_BY_KEY: Record<string, LucideIcon> = {
    programs: Dumbbell,
    nutrition: Apple,
    cardio: HeartPulse,
    movement: PersonStanding,
    team: UsersRound,
    funciones: SlidersHorizontal,
    options: Settings,
    settings_team: Settings,
    support: LifeBuoy,
}

/**
 * Una línea por fila: qué es esa pantalla, en las palabras del coach. VERBATIM del `ROW_SUBTITLE`
 * de RN (`app/coach/(tabs)/more.tsx`) — el coach no puede leer una cosa en la app y otra en la
 * PWA. Cortas a propósito: la fila trunca, no envuelve.
 */
const ROW_SUBTITLE: Record<string, string> = {
    programs: 'Biblioteca y plantillas',
    nutrition: 'Planes y alimentos',
    cardio: 'Zonas, pace e intervalos',
    movement: 'Screening y reporte semáforo',
    team: 'Tu pool y sus alumnos',
    funciones: 'Especialidad y qué se ve en tu panel',
    options: 'Marca, plan y cuenta',
    settings_team: 'Marca, plan y cuenta',
    support: 'Escríbenos si algo no funciona',
}

/** Clase del estado activo — misma dupla tono/tinte que el sidebar y la cápsula. */
const ACTIVE_ROW_CLASS = 'bg-[var(--sport-100)] text-[var(--sport-600)]'

function MoreRow({ item, active, onNavigate }: { item: NavModule; active: boolean; onNavigate: () => void }) {
    const glyph = ROW_GLYPH_BY_KEY[item.key]
    const Icon = ROW_ICON_BY_KEY[item.key] ?? SlidersHorizontal
    // Tono de marca para los dominios de trabajo (los que tienen `featureDomain`); neutro para
    // gestión. Mismo criterio que el `tone` del `IconTile` de la hoja de RN.
    const brand = item.featureDomain != null
    const subtitle = ROW_SUBTITLE[item.key]

    return (
        <li>
            <Link
                href={item.href}
                data-testid={`coach-more-${item.key}`}
                aria-current={active ? 'page' : undefined}
                // La hoja se cierra en el tap: la navegación la pinta el propio panel detrás, y
                // dejarla abierta taparía la pantalla a la que el coach acaba de entrar.
                onClick={onNavigate}
                className={cn(
                    'flex w-full items-center gap-3.5 rounded-[var(--radius-md)] px-1.5 py-2.5 text-left transition-colors',
                    active ? ACTIVE_ROW_CLASS : 'text-[var(--text-strong)]'
                )}
            >
                <span
                    className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-control',
                        brand ? 'bg-[var(--sport-100)] text-[var(--sport-600)]' : 'bg-surface-sunken text-subtle'
                    )}
                >
                    {glyph ? (
                        <CoachNavIcon concept={glyph} className="size-[22px]" />
                    ) : (
                        <Icon className="size-[22px]" />
                    )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                    {/* `item.label` y no un mapa de display: las únicas keys cuyo rótulo del diseño
                        difiere del registro son `dashboard` («Inicio») y `clients`, y esas dos
                        NUNCA llegan al overflow — `buildMobileBar` las fija en la barra. Igual que
                        la hoja de RN, que también pinta `item.label`. */}
                    <span className="truncate text-[15px] font-bold leading-tight">{item.label}</span>
                    {subtitle && (
                        <span
                            className={cn(
                                'truncate text-[12.5px] font-medium leading-tight',
                                active ? 'text-[var(--sport-600)] opacity-80' : 'text-[var(--text-muted)]'
                            )}
                        >
                            {subtitle}
                        </span>
                    )}
                </span>
                <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />
            </Link>
        </li>
    )
}

function NavSection({
    title,
    items,
    pathname,
    onNavigate,
}: {
    title: string
    items: NavModule[]
    pathname: string
    onNavigate: () => void
}) {
    // Sección sin filas ⇒ no se pinta NADA (tampoco el encabezado): BRIEF §5.2.
    if (items.length === 0) return null
    return (
        <section aria-label={title}>
            <h3 className="px-1.5 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                {title}
            </h3>
            <ul className="flex flex-col">
                {items.map((item) => (
                    <MoreRow
                        key={item.key}
                        item={item}
                        active={isNavItemActiveForPath(item, pathname)}
                        onNavigate={onNavigate}
                    />
                ))}
            </ul>
        </section>
    )
}

/**
 * Cuerpo de la hoja, SIN el chasis del `Sheet`. Se exporta para poder testear el contrato de
 * agrupación/estado activo sin pelear con el portal de base-ui en jsdom.
 *
 * `groupNavItems` reparte en los mismos 3 grupos que el sidebar; acá se pintan solo «Tu trabajo» y
 * «Gestión» porque `principal` (Inicio / Alumnos) vive en la barra y nunca sobra.
 */
export function CoachMoreSheetBody({
    items,
    pathname,
    onNavigate,
}: {
    items: NavModule[]
    pathname: string
    onNavigate: () => void
}) {
    const groups = groupNavItems(items)
    return (
        <div className="flex flex-col">
            <NavSection title="Tu trabajo" items={groups.trabajo} pathname={pathname} onNavigate={onNavigate} />
            <NavSection title="Gestión" items={groups.gestion} pathname={pathname} onNavigate={onNavigate} />
        </div>
    )
}

/**
 * Hoja «Más» completa. Chasis 1:1 con el `DashboardFab`: bottom sheet sin botón de cierre, handle
 * arriba, `rounded-t-sheet` y respiro de safe-area abajo. `md:hidden` porque en desktop no existe:
 * el sidebar pinta el nav entero (W2.4).
 */
export function CoachMoreSheet({
    open,
    onOpenChange,
    items,
    pathname,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    items: NavModule[]
    pathname: string
}) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                showCloseButton={false}
                className="max-h-[min(80dvh,80svh)] gap-0 rounded-t-sheet border-subtle bg-surface-card p-0 text-body md:hidden"
            >
                <div className="flex min-h-0 flex-col overflow-y-auto px-3.5 pt-2.5 pb-[max(20px,env(safe-area-inset-bottom))]">
                    <div
                        className="mx-auto mb-2 mt-1.5 h-1 w-9 shrink-0 rounded-pill bg-[var(--border-default)]"
                        aria-hidden="true"
                    />
                    <SheetHeader className="border-0 bg-transparent p-0">
                        <SheetTitle className="px-1.5 text-[17px] normal-case tracking-tight text-[var(--text-strong)]">
                            Más
                        </SheetTitle>
                        <SheetDescription className="px-1.5 text-[13px] text-[var(--text-muted)]">
                            Lo que no cabe en la barra.
                        </SheetDescription>
                    </SheetHeader>
                    <CoachMoreSheetBody
                        items={items}
                        pathname={pathname}
                        onNavigate={() => onOpenChange(false)}
                    />
                </div>
            </SheetContent>
        </Sheet>
    )
}
