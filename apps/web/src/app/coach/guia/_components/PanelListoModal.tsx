'use client'

import { useCallback, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Check, EyeOff } from 'lucide-react'
import {
    DOMAIN_ENABLED_KEY,
    FEATURE_DOMAIN_KEYS,
    resolvePersonaPrefs,
    type FeatureDomain,
} from '@eva/feature-prefs'
import type { Persona } from '@eva/schemas'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * «Tu panel quedó listo 💪» — el acuse de recibo de «¿A qué te dedicas?».
 *
 * Momento (pedido literal del owner): aparece INMEDIATAMENTE DESPUÉS de la elección, o sea al
 * aterrizar en la guía con `?panel_listo=1` — NO al terminar los cinco pasos. El coach acaba de
 * ver que el menú se le achicó y esta es la única pantalla donde eso se explica antes de que se
 * lo pregunte.
 *
 * Solo se muestra si la elección APAGÓ algo: con el escape `other` (panel completo) no hay nada
 * que avisar y el componente se borra solo. El param es one-shot: al cerrar se limpia con
 * `router.replace` (mismo patrón que `RegistrationMirror`). Recargar con el param todavía en la
 * URL lo vuelve a abrir; es aceptable porque el gesto normal —cerrar— lo saca.
 *
 * Los chips salen de la MISMA matriz que se persistió en `coach_feature_prefs`
 * (`resolvePersonaPrefs`), no de una lista paralela que se desincronice.
 */

/** Ruta real de «Mi panel» (Opciones › Mi panel), donde se reactivan los dominios apagados. */
const MI_PANEL_ROUTE = '/coach/settings/funciones'

/**
 * Etiquetas humanas por dominio. Copia deliberada de `DOMAIN_META` de
 * `coach/settings/funciones/_data/funciones.queries.ts`: ese módulo importa el cliente
 * service-role y NUNCA puede entrar en un client component. Si allá cambia un label, cambia acá.
 */
const DOMAIN_LABEL: Record<FeatureDomain, string> = {
    nutrition: 'Nutrición',
    training: 'Entrenamiento',
    cardio: 'Cardio',
    movement: 'Movimiento',
    bodycomp: 'Composición corporal',
}

/** «A», «A y B», «A, B y C» — enumeración latam sin coma de Oxford. */
function enumerate(items: readonly string[]): string {
    if (items.length <= 1) return items[0] ?? ''
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

export interface PanelListoModalProps {
    persona: Persona
    /** `coaches.persona_also_other`: la segunda pregunta de la pantalla de persona. */
    alsoOther: boolean
}

export function PanelListoModal({ persona, alsoOther }: PanelListoModalProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [open, setOpen] = useState(true)

    const close = useCallback(() => {
        setOpen(false)
        // El param es one-shot: sin esto, cualquier `router.refresh()` de la guía (vuelta de
        // «Vive tu app», bfcache) reabriría el modal.
        const params = new URLSearchParams(searchParams.toString())
        if (!params.has('panel_listo')) return
        params.delete('panel_listo')
        router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
    }, [pathname, router, searchParams])

    const prefs = resolvePersonaPrefs(persona, alsoOther)
    const shown = FEATURE_DOMAIN_KEYS.filter((domain) => prefs[domain][DOMAIN_ENABLED_KEY])
    const hidden = FEATURE_DOMAIN_KEYS.filter((domain) => !prefs[domain][DOMAIN_ENABLED_KEY])

    // Nada apagado (el escape `other`) ⇒ no hay noticia que dar. El guard vive también en el
    // server action que arma el param; acá es defensa en profundidad por si alguien llega con la
    // URL escrita a mano.
    if (hidden.length === 0 || shown.length === 0) return null

    const shownLabels = shown.map((domain) => DOMAIN_LABEL[domain])
    const hiddenLabels = hidden.map((domain) => DOMAIN_LABEL[domain])

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && close()}>
            <DialogContent
                showCloseButton={false}
                /* Chico y centrado en desktop; pegado abajo y ancho completo en móvil, que es el
                   gesto que ya conoce quien vive en el teléfono (look de bottom sheet). */
                className={cn(
                    'sm:max-w-md',
                    'max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-b-none'
                )}
            >
                <DialogHeader>
                    <DialogTitle className="font-display text-[19px] font-extrabold normal-case tracking-[-0.02em] text-[var(--text-strong)]">
                        Tu panel quedó listo 💪
                    </DialogTitle>
                    <DialogDescription className="text-[13.5px] leading-relaxed text-[var(--text-muted)]">
                        Dejamos {enumerate(shownLabels)} a la vista, que es lo tuyo.{' '}
                        {enumerate(hiddenLabels)} quedaron guardadas, no borradas.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-1 flex flex-col gap-3">
                    <ChipRow
                        icon={<Check className="size-3.5" aria-hidden="true" />}
                        title="A la vista"
                        labels={shownLabels}
                        tone="on"
                    />
                    <ChipRow
                        icon={<EyeOff className="size-3.5" aria-hidden="true" />}
                        title="Apagados"
                        labels={hiddenLabels}
                        tone="off"
                    />
                </div>

                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-subtle)]">
                    Actívalas cuando quieras en Opciones → Mi panel.
                </p>

                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Link
                        href={MI_PANEL_ROUTE}
                        onClick={close}
                        className="inline-flex h-11 touch-manipulation items-center justify-center rounded-control border border-subtle px-4 text-[13.5px] font-bold text-[var(--text-strong)] transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                    >
                        Ir a Mi panel
                    </Link>
                    <button
                        type="button"
                        onClick={close}
                        className={cn(
                            'inline-flex h-11 touch-manipulation items-center justify-center rounded-control px-5 text-[13.5px] font-bold',
                            'bg-[var(--cta-fill)] text-[var(--text-on-sport)] motion-safe:transition-colors hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]'
                        )}
                    >
                        Entendido
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Una fila de chips con su rótulo. `tone` separa lo que quedó a la vista de lo apagado.
 *
 * El acento de marca es SOLO el borde del chip: pintar `bg-[var(--sport-100)]` con
 * `text-[var(--sport-700)]` encima es exactamente lo que el owner no pudo leer en dark (QA 22-08,
 * hallazgo 2 — ver la banda de bienvenida de `GuideScreen`). El texto usa los tokens de siempre,
 * que ya tienen contraste AA en los dos temas.
 */
function ChipRow({
    icon,
    title,
    labels,
    tone,
}: {
    icon: ReactNode
    title: string
    labels: readonly string[]
    tone: 'on' | 'off'
}) {
    return (
        <div>
            <p
                className={cn(
                    'flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em]',
                    tone === 'on' ? 'text-[var(--text-strong)]' : 'text-[var(--text-subtle)]'
                )}
            >
                {icon}
                {title}
            </p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {labels.map((label) => (
                    <li
                        key={label}
                        className={cn(
                            'rounded-pill border px-2.5 py-1 text-[12px] font-bold',
                            tone === 'on'
                                ? 'border-[var(--sport-500)]/45 bg-surface-card text-[var(--text-strong)]'
                                : 'border-dashed border-subtle bg-surface-sunken text-[var(--text-muted)]'
                        )}
                    >
                        {label}
                    </li>
                ))}
            </ul>
        </div>
    )
}
