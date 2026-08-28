'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { usePostHog } from 'posthog-js/react'
import {
    ChevronDown,
    ChevronRight,
    ClipboardList,
    Dumbbell,
    Hash,
    Layers,
    LayoutList,
    ListChecks,
    Plus,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export interface LibraryHeaderProps {
    templateCount: number
    activeAssignedCount: number
    totalCount: number
    onNewTemplate: () => void
    className?: string
}

/** Destino del ejercicio personalizado: el catálogo abre su modal de creación con `?create=1`. */
const NEW_EXERCISE_HREF = '/coach/exercises?create=1'

/**
 * El CTA hero de la biblioteca dejó de ser «Nueva plantilla» (una sola salida) y pasa a «Nueva»,
 * que PREGUNTA qué crear: un programa o un ejercicio personalizado. El coach que buscaba crear un
 * ejercicio tenía que adivinar que vivía detrás de «Lista de ejercicios».
 *
 * Dos superficies por breakpoint, sin hooks de media query (CSS puro, cero flash en SSR):
 * desktop/tablet = dropdown anclado al botón; móvil = bottom sheet con filas grandes (mismo
 * patrón que `WorkoutDoneSheet` del área alumno).
 */
export function LibraryHeader({
    templateCount,
    activeAssignedCount,
    totalCount,
    onNewTemplate,
    className,
}: LibraryHeaderProps) {
    const { t } = useTranslation()
    const router = useRouter()
    const ph = usePostHog()
    const [sheetOpen, setSheetOpen] = useState(false)

    const capturePressed = (surface: 'desktop' | 'mobile') => {
        ph?.capture('library_new_pressed', { surface })
    }

    const choose = (choice: 'program' | 'exercise', surface: 'desktop' | 'mobile') => {
        ph?.capture('library_new_choice', { choice, surface })
        if (surface === 'mobile') setSheetOpen(false)
        if (choice === 'program') onNewTemplate()
        else router.push(NEW_EXERCISE_HREF)
    }

    return (
        <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
            <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                    <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-strong sm:text-3xl">
                        Biblioteca de programas
                    </h1>
                    <InfoTooltip content={t('section.coachPrograms')} />
                </div>
                <p className="text-sm text-muted">
                    Crea plantillas, asígnalas y gestiona planes en curso.
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                    <Badge tone="sport" variant="soft" icon={<Layers aria-hidden />}>
                        {templateCount} plantillas
                    </Badge>
                    <Badge tone="success" variant="soft" icon={<ListChecks aria-hidden />}>
                        {activeAssignedCount} activos
                    </Badge>
                    <Badge tone="neutral" variant="soft" icon={<Hash aria-hidden />}>
                        {totalCount} total
                    </Badge>
                </div>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {/* Movida 2: "Ejercicios" deja de ser menu top-level — entrada contextual aqui.
                    La ruta /coach/exercises sigue viva (deep links + app alumno). */}
                <Link
                    href="/coach/exercises"
                    className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'h-11 w-full gap-2 rounded-control px-4 sm:h-10 sm:w-auto'
                    )}
                >
                    <Dumbbell className="size-4" />
                    Lista de ejercicios
                </Link>
                {/* Reestructura settings F6: "Áreas del builder" sale del hub Opciones y vive acá,
                    junto al builder donde se usan. La ruta /coach/settings/areas sigue viva (deep links). */}
                <Link
                    href="/coach/settings/areas"
                    className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'h-11 w-full gap-2 rounded-control px-4 sm:h-10 sm:w-auto'
                    )}
                >
                    <LayoutList className="size-4" />
                    Áreas del builder
                </Link>

                {/* Desktop/tablet (sm+): menú anclado. */}
                <DropdownMenu
                    onOpenChange={(open) => {
                        if (open) capturePressed('desktop')
                    }}
                >
                    <DropdownMenuTrigger
                        aria-label="Crear programa o ejercicio"
                        // Neutraliza el look "secundario" del trigger del DS y lo pinta como el
                        // Button variant="sport" (mismo fill/glow de marca), incluidas las
                        // reglas `dark:` propias del trigger (si no, en oscuro se pinta blanco 5%).
                        className="hidden h-10 gap-2 rounded-control border-transparent bg-[var(--cta-fill)] px-4 text-sm font-bold normal-case tracking-normal text-[var(--text-on-sport)] shadow-[var(--glow-sport)] backdrop-blur-none hover:border-transparent hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] sm:inline-flex dark:border-transparent dark:bg-[var(--cta-fill)] dark:hover:border-transparent dark:hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]"
                    >
                        <Plus className="size-4" />
                        Nueva
                        <ChevronDown className="size-4 opacity-80" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-72 p-1.5">
                        <DropdownMenuItem
                            onClick={() => choose('program', 'desktop')}
                            className="items-start gap-3 rounded-control p-2.5"
                        >
                            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control bg-sport-500/18 text-sport-600 dark:text-sport-300">
                                <ClipboardList className="size-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-strong">Programa nuevo</span>
                                <span className="mt-0.5 block text-xs text-muted">
                                    Plantilla o rutina para asignar a tus alumnos
                                </span>
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => choose('exercise', 'desktop')}
                            className="items-start gap-3 rounded-control p-2.5"
                        >
                            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-control bg-[var(--success-500)]/18 text-[var(--success-600)]">
                                <Dumbbell className="size-4.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-strong">Ejercicio personalizado</span>
                                <span className="mt-0.5 block text-xs text-muted">
                                    Queda en tu biblioteca para usarlo en cualquier programa
                                </span>
                            </span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Móvil (<sm): el mismo par de opciones en bottom sheet (tap targets grandes). */}
                <Button
                    type="button"
                    variant="sport"
                    aria-label="Crear programa o ejercicio"
                    onClick={() => {
                        capturePressed('mobile')
                        setSheetOpen(true)
                    }}
                    className="h-11 w-full gap-2 rounded-control px-4 sm:hidden"
                >
                    <Plus className="size-4" />
                    Nueva
                </Button>
            </div>

            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetContent
                    side="bottom"
                    showCloseButton={false}
                    className="max-h-[85dvh] gap-0 rounded-t-sheet p-0"
                    aria-label="¿Qué querés crear?"
                >
                    <div className="flex flex-col gap-1 px-5 pb-2 pt-4">
                        <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-border dark:bg-white/15" aria-hidden />
                        <h2 className="font-display text-xl font-extrabold uppercase tracking-tight text-strong">
                            ¿Qué querés crear?
                        </h2>
                        <p className="text-[13px] font-semibold text-muted">Elegí qué sumar a tu biblioteca.</p>
                    </div>

                    <div className="flex flex-col gap-2.5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3">
                        <button
                            type="button"
                            onClick={() => choose('program', 'mobile')}
                            className="group flex items-center gap-3.5 rounded-card border-2 border-sport-500/55 bg-sport-100/60 p-4 text-left transition-colors hover:bg-sport-100 dark:bg-sport-500/[0.10] dark:hover:bg-sport-500/[0.16]"
                        >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-sport-500/18 text-sport-600 dark:text-sport-300">
                                <ClipboardList className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-black text-strong">Programa nuevo</span>
                                <span className="mt-0.5 block text-xs font-semibold text-muted">
                                    Plantilla o rutina para asignar a tus alumnos
                                </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-sport-600 transition-transform group-hover:translate-x-0.5 dark:text-sport-300" />
                        </button>

                        <button
                            type="button"
                            onClick={() => choose('exercise', 'mobile')}
                            className="group flex items-center gap-3.5 rounded-card border-2 border-[var(--success-500)]/55 bg-[var(--success-100)]/60 p-4 text-left transition-colors hover:bg-[var(--success-100)] dark:bg-[var(--success-500)]/[0.10] dark:hover:bg-[var(--success-500)]/[0.16]"
                        >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-[var(--success-500)]/18 text-[var(--success-600)]">
                                <Dumbbell className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-black text-strong">Ejercicio personalizado</span>
                                <span className="mt-0.5 block text-xs font-semibold text-muted">
                                    Queda en tu biblioteca para usarlo en cualquier programa
                                </span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--success-600)] transition-transform group-hover:translate-x-0.5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => setSheetOpen(false)}
                            className="mt-1 w-full rounded-control py-2.5 text-center text-[13px] font-bold text-muted transition-colors hover:text-strong"
                        >
                            Cancelar
                        </button>
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
