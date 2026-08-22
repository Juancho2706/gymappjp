'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stepAnchorId, type GuideStepView } from '../_lib/guide-view'

/**
 * Una de las 5 tarjetas de la guía. Grande y con aire: en su casa nueva
 * (`/coach/guia`, decisión del owner 22-08) la guía dejó de ser una lista apretada arriba del
 * dashboard y es la pantalla entera, así que cada paso se lee de un vistazo.
 *
 * Tres estados visuales (`resolveStepViews`): `done` (tildado, apagado), `next` (el ÚNICO
 * destacado, con anillo de marca, rótulo «Empieza por aquí» y CTA sólido) y `pending` (visible
 * pero en segundo plano). Nunca hay dos pasos compitiendo por la atención.
 *
 * Iconos: NO hay iconografía por paso. El QA del owner (22-08, hallazgo 3) fue explícito —los
 * lucide genéricos (paleta, celular, portapapeles…) no decían nada— así que el avatar de cada
 * paso pendiente es el monito de EVA sobre el color de marca, el MISMO recurso que la píldora
 * flotante (`components/coach/GuidePill.tsx`). El paso hecho muestra el tilde sobre verde.
 *
 * `children` es el hueco para lo que no es un link: la tarjeta «Tu marca en 60 segundos» del paso
 * 1 y el botón «Vive tu app» del paso 2.
 */
export function GuideStepCard({
    view,
    href,
    ctaLabel,
    hint,
    onOpen,
    children,
    block,
}: {
    view: GuideStepView
    /** Destino ya resuelto (`resolveHref` + `?primera=1` donde corresponde). `null` = no navega. */
    href: string | null
    ctaLabel: string
    /** Línea extra para los pasos que NO dispara el coach (el aha lo completa su alumno). */
    hint?: string
    onOpen: () => void
    /** Acción extra en la fila del CTA (el botón «Vive tu app» del paso 2). */
    children?: ReactNode
    /** Bloque a lo ancho debajo del CTA (la tarjeta «Tu marca en 60 segundos» del paso 1). */
    block?: ReactNode
}) {
    const { step, position, state } = view
    const done = state === 'done'
    const isNext = state === 'next'

    return (
        <li
            // Ancla + `tabIndex={-1}`: la banda de bienvenida manda el scroll y el foco acá, así
            // el coach que acaba de elegir persona aterriza EN el paso que sigue y no arriba de
            // todo. `scroll-mt-*` deja aire para la cabecera pegajosa del panel.
            id={stepAnchorId(step.key)}
            tabIndex={-1}
            className={cn(
                'scroll-mt-24 rounded-card border bg-surface-card p-4 sm:p-5',
                'motion-safe:transition-[border-color,box-shadow] motion-safe:duration-[var(--dur-base)]',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                isNext
                    ? 'border-[var(--sport-500)] shadow-[var(--shadow-md)] ring-2 ring-[var(--sport-500)]/25'
                    : 'border-subtle shadow-[var(--shadow-xs)]',
                done && 'opacity-80'
            )}
        >
            <div className="flex items-start gap-3.5">
                <span
                    aria-hidden="true"
                    className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-control',
                        done ? 'bg-[var(--success-100)] text-[var(--success-600)]' : 'bg-[var(--sport-500)]',
                        // Un solo paso compite por la atención: los pendientes llevan la marca atenuada.
                        !done && !isNext && 'opacity-60'
                    )}
                >
                    {done ? (
                        <Check className="size-[22px]" />
                    ) : (
                        <Image
                            src="/LOGOS/eva-icon-white.png"
                            alt=""
                            width={24}
                            height={24}
                            className="size-6 object-contain"
                            priority={false}
                        />
                    )}
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
                            Paso {position}
                        </span>
                        {done && (
                            <span className="rounded-pill bg-[var(--success-100)] px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-[var(--success-700)]">
                                Hecho
                            </span>
                        )}
                        {/* Chip sobre `--cta-fill` (opaco también en dark) y no `--sport-500` (70 % de
                            alpha en dark): `--text-on-sport` se calcula contra la marca plena. */}
                        {isNext && (
                            <span className="rounded-pill bg-[var(--cta-fill)] px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-[0.04em] text-[var(--text-on-sport)]">
                                Empieza por aquí
                            </span>
                        )}
                    </div>

                    <h3
                        className={cn(
                            'mt-1 font-display text-[17px] font-extrabold leading-snug tracking-[-0.02em] text-[var(--text-strong)] sm:text-[18px]',
                            done && 'line-through decoration-[var(--text-subtle)] decoration-1'
                        )}
                    >
                        {step.label}
                    </h3>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                        {step.description}
                    </p>

                    {hint && (
                        <p className="mt-2 text-[12.5px] font-semibold text-[var(--text-subtle)]">{hint}</p>
                    )}

                    {(href || children) && !done && (
                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                            {href && (
                                <Link
                                    href={href}
                                    onClick={onOpen}
                                    className={cn(
                                        'inline-flex h-11 touch-manipulation items-center gap-1.5 rounded-control px-4 text-[13.5px] font-bold',
                                        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                                        'motion-safe:transition-colors',
                                        isNext
                                            ? 'bg-[var(--cta-fill)] text-[var(--text-on-sport)] hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]'
                                            : 'border border-[var(--border-default)] bg-surface-card text-[var(--text-strong)] hover:bg-surface-sunken'
                                    )}
                                >
                                    {ctaLabel}
                                    <ArrowRight className="size-4" />
                                </Link>
                            )}
                            {children}
                        </div>
                    )}
                </div>
            </div>

            {/* A lo ancho de la tarjeta (no en la columna del texto): la tarjeta de marca del paso
                1 tiene su propia vista previa del login y necesita todo el ancho disponible. */}
            {block && !done && <div className="mt-4">{block}</div>}
        </li>
    )
}
