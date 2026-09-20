'use client'

import Link from 'next/link'
import { SquarePen, RotateCcw, ChevronRight } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'

/**
 * Sheet de "doble intención" al tocar un día YA HECHO en OTRO día de la semana (mockup v3.3). El
 * alumno elige entre CORREGIR los registros de esa fecha (editar, jamás duplica) o REPETIR hoy como
 * instancia nueva precargada con los valores de ese día. Nivel dashboard → claro/oscuro + responsive
 * (reusa el bottom-sheet del DS).
 *
 * El titular es variable (`heading`): el mismo sheet sirve al día PASADO a medias ("Entrenamiento
 * incompleto", spec `workout-day-in-progress`), donde el copy de "ya hiciste" sería falso.
 *
 * SPEC `vuelta-nueva-salud-y-reloj` §3.5: con `sessionDateLabel` (sesión REALMENTE pasada) las dos
 * opciones se INTERCAMBIAN —posición, jerarquía visual y destino—: entrenarlo hoy (`?repetir=`) pasa
 * a destacada y corregir los registros de ese día (`?fecha=`) baja a neutra. El tratamiento visual no
 * se toca: es el que este sheet ya tenía. Sin `sessionDateLabel` (día hecho HOY, hero) nada cambia.
 *
 * Presentacional puro: las URLs las construye el caller con `buildWorkoutEditHref`/`buildWorkoutRepeatHref`
 * (helpers puros testeables). Navegar cierra el sheet solo; "Cancelar" y el backdrop también.
 */
export function WorkoutDoneSheet({
    open,
    onOpenChange,
    heading = 'Ya hiciste este entrenamiento',
    title,
    subtitle,
    editHref,
    repeatHref,
    showRepeat = true,
    sessionDateLabel,
    onLaunch,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Titular del sheet. Por defecto el de un día completo; el día a medias manda el suyo. */
    heading?: string
    /** Nombre del entreno (título del plan). */
    title: string
    /** "Martes — Día 2 · 15 jul" (label del día + fecha). */
    subtitle: string
    editHref: string
    /** Destino de "Repetir hoy". Se puede omitir cuando `showRepeat` es `false`. */
    repeatHref?: string
    /**
     * Si el día hecho es HOY MISMO, "Repetir hoy" NO se ofrece (decisión CEO): el índice único de la
     * DB es por día, así que repetir hoy sobre hoy pisaría la misma fila. Queda solo "Revisar y editar".
     */
    showRepeat?: boolean
    /**
     * Fecha corta de la sesión ("16 sept") cuando es REALMENTE pasada. Presente ⇒ modo corrección:
     * "Entrenarlo hoy" primero y destacada, "Corregir registros del {16 sept}" neutra debajo. Se omite
     * en el día hecho HOY (el hero y la celda de hoy), que conserva "Revisar y editar" sola.
     */
    sessionDateLabel?: string
    /**
     * QA7: al elegir una opción se dispara el MORPH de lanzamiento con el destino elegido (mismo puente
     * visual que un tap directo). Si se omite, los enlaces navegan normal (sin morph). El rect del morph
     * se toma del botón elegido; leemos la geometría antes de cerrar el sheet.
     */
    onLaunch?: (el: HTMLElement, href: string) => void
}) {
    const choose = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (onLaunch) {
            e.preventDefault()
            onLaunch(e.currentTarget, href) // lee el rect AHORA (el elemento aún está montado)
        }
        onOpenChange(false)
    }

    // Modo corrección: sólo con una sesión pasada Y la opción de repetir disponible (el día hecho HOY
    // no la tiene: repetir hoy sobre hoy pisaría la misma fila). Los destinos se intercambian junto
    // con el rótulo — renombrar el botón sin mover el `href` sería el bug clásico de este cambio.
    const corrige = sessionDateLabel != null && showRepeat && repeatHref != null

    /** Opción con el tratamiento destacado (borde 2 px + tinte sport + tile con ícono). */
    const destacada = corrige
        ? {
              href: repeatHref!,
              Icon: RotateCcw,
              title: 'Entrenarlo hoy',
              subtitle: `Sesión nueva de hoy, con tus valores del ${sessionDateLabel} ya cargados`,
          }
        : {
              href: editHref,
              Icon: SquarePen,
              title: 'Revisar y editar',
              subtitle: 'Abre tus registros de ese día y corrige lo que quieras',
          }

    /** Opción neutra (borde simple + tile hundido). `null` cuando no hay segunda intención que ofrecer. */
    const neutra = corrige
        ? {
              href: editHref,
              Icon: SquarePen,
              title: `Corregir registros del ${sessionDateLabel}`,
              subtitle: 'Cambia lo que anotaste ese día. No cuenta como entreno de hoy.',
          }
        : showRepeat && repeatHref
          ? {
                href: repeatHref,
                Icon: RotateCcw,
                title: 'Repetir hoy',
                subtitle: 'Arranca con tus valores de ese día, listos para editar',
            }
          : null

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                showCloseButton={false}
                // Movil (<md): bottom sheet byte-identico. Desktop (md+): MODAL CENTRADO. Base UI ancla
                // el side=bottom con selectores atributo (mayor especificidad), asi que los overrides md+
                // van con `!` (important). Centrado robusto sin transform: inset-0 + margin auto + alto
                // intrinseco (evita chocar con la translate-y de entrada del sheet).
                className="max-h-[85dvh] gap-0 rounded-t-sheet p-0 md:inset-0! md:m-auto! md:h-max! md:w-full! md:max-w-md! md:rounded-2xl! md:border!"
                aria-label={heading}
            >
                <div className="flex flex-col gap-1 px-5 pb-2 pt-4">
                    {/* Asa de arrastre: solo en el bottom sheet movil; en el modal desktop no aplica. */}
                    <div className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-border md:hidden dark:bg-white/15" aria-hidden />
                    <h2 className="font-display text-xl font-black tracking-tight text-strong">{heading}</h2>
                    <p className="text-[13px] font-semibold text-muted">
                        <span className="text-strong">{title}</span>
                        {subtitle ? <> · {subtitle}</> : null}
                    </p>
                </div>

                <div className="flex flex-col gap-2.5 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3">
                    {/* Opción destacada: entrenarlo hoy en el modo corrección, revisar y editar si no. */}
                    <Link
                        href={destacada.href}
                        onClick={choose(destacada.href)}
                        className="group flex items-center gap-3.5 rounded-card border-2 border-sport-500/55 bg-sport-100/60 p-4 text-left transition-colors hover:bg-sport-100 dark:bg-sport-500/[0.10] dark:hover:bg-sport-500/[0.16]"
                    >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-sport-500/18 text-sport-600 dark:text-sport-300">
                            <destacada.Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-[15px] font-black text-strong">{destacada.title}</span>
                            <span className="mt-0.5 block text-xs font-semibold text-muted">{destacada.subtitle}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-sport-600 transition-transform group-hover:translate-x-0.5 dark:text-sport-300" />
                    </Link>

                    {/* Segunda intención, neutra: corregir esa fecha (modo corrección) o repetir hoy. */}
                    {neutra ? (
                        <Link
                            href={neutra.href}
                            onClick={choose(neutra.href)}
                            className="group flex items-center gap-3.5 rounded-card border border-subtle bg-surface-card p-4 text-left transition-colors hover:bg-surface-sunken"
                        >
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-subtle">
                                <neutra.Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[15px] font-black text-strong">{neutra.title}</span>
                                <span className="mt-0.5 block text-xs font-semibold text-muted">{neutra.subtitle}</span>
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    ) : null}

                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="mt-1 w-full rounded-control py-2.5 text-center text-[13px] font-bold text-muted transition-colors hover:text-strong"
                    >
                        Cancelar
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
