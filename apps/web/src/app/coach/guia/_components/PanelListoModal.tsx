'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Apple, Dumbbell, HeartPulse, PersonStanding, Ruler } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
    DOMAIN_ENABLED_KEY,
    FEATURE_DOMAIN_KEYS,
    resolvePersonaPrefs,
    type FeatureDomain,
} from '@eva/feature-prefs'
import type { Persona } from '@eva/schemas'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { savePanelListoDomainsAction } from '../_actions/panel-listo.actions'

/**
 * «Tu panel quedó listo 💪» — el cierre de «¿A qué te dedicas?», INTERACTIVO.
 *
 * Momento (pedido literal del owner): aparece INMEDIATAMENTE DESPUÉS de la elección, o sea al
 * aterrizar en la guía con `?panel_listo=1` — NO al terminar los cinco pasos.
 *
 * Qué cambió (pedido del owner, 26-08): dejó de ser un aviso con chips y un «Entendido». Ahora los
 * 5 dominios vienen con SWITCH, sembrados con lo que dejó la matriz de la persona, y el coach los
 * prende o apaga ACÁ, antes de seguir su guía. El motivo textual: «lo que no quiero es que luego
 * diga ¿y mi nutrición? ¿y mi cardio?». La única salida es «Continuar», que persiste SOLO lo que
 * difiere de lo sembrado y cierra; si no tocó nada, cierra sin escribir.
 *
 * Solo se muestra si la elección APAGÓ algo: con el escape `other` (panel completo) no hay nada que
 * decidir y el componente se borra solo. El param es one-shot: al cerrar se limpia con
 * `router.replace` (mismo patrón que `RegistrationMirror`).
 *
 * El estado sembrado sale de la MISMA matriz que se persistió en `coach_feature_prefs`
 * (`resolvePersonaPrefs`), no de una lista paralela que se desincronice; y el write pasa por el
 * mismo servicio que «Opciones › Mi panel» (ver `_actions/panel-listo.actions.ts`).
 */

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

/** Ícono por dominio — el MISMO mapeo que `MiPanelClient.tsx`, que es el patrón que se imita. */
const DOMAIN_ICONS: Record<FeatureDomain, LucideIcon> = {
    nutrition: Apple,
    training: Dumbbell,
    cardio: HeartPulse,
    movement: PersonStanding,
    bodycomp: Ruler,
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
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    /** Lo que la matriz de la persona dejó escrito. Es el punto de comparación del diff. */
    const seeded = useMemo(() => {
        const prefs = resolvePersonaPrefs(persona, alsoOther)
        return Object.fromEntries(
            FEATURE_DOMAIN_KEYS.map((domain) => [domain, prefs[domain][DOMAIN_ENABLED_KEY]]),
        ) as Record<FeatureDomain, boolean>
    }, [persona, alsoOther])

    const [state, setState] = useState<Record<FeatureDomain, boolean>>(seeded)

    const close = useCallback(() => {
        setOpen(false)
        // El param es one-shot: sin esto, cualquier `router.refresh()` de la guía (vuelta de
        // «Vive tu app», bfcache) reabriría el modal.
        const params = new URLSearchParams(searchParams.toString())
        if (!params.has('panel_listo')) return
        params.delete('panel_listo')
        router.replace(params.size > 0 ? `${pathname}?${params.toString()}` : pathname, { scroll: false })
    }, [pathname, router, searchParams])

    const changes = FEATURE_DOMAIN_KEYS.filter((domain) => state[domain] !== seeded[domain]).map(
        (domain) => ({ domain, enabled: state[domain] }),
    )

    /** «Continuar»: guarda lo que difiere y cierra. Sin cambios ⇒ cierra sin escribir. */
    function submit() {
        if (isPending) return
        if (changes.length === 0) {
            close()
            return
        }
        setError(null)
        startTransition(async () => {
            const result = await savePanelListoDomainsAction({ changes })
            if (!result.ok) {
                // No se traba la salida: el modal ofrece reintentar o seguir sin guardar (el panel
                // queda como lo dejó la matriz, que es lo que ya está en la base).
                setError(result.error)
                return
            }
            // El menú del coach acaba de cambiar: sin esto la guía sigue pintando el nav viejo.
            router.refresh()
            close()
        })
    }

    const hidden = FEATURE_DOMAIN_KEYS.filter((domain) => !seeded[domain])
    const shown = FEATURE_DOMAIN_KEYS.filter((domain) => seeded[domain])

    // Nada apagado (el escape `other`) ⇒ no hay nada que decidir. El guard vive también en el
    // server action que arma el param; acá es defensa en profundidad por si alguien llega con la
    // URL escrita a mano.
    if (hidden.length === 0 || shown.length === 0) return null

    return (
        <Dialog
            open={open}
            onOpenChange={(isOpen) => {
                if (isOpen || isPending) return
                // Con un error a la vista, salir es salir: ya se le avisó que puede reintentar.
                if (error) {
                    close()
                    return
                }
                // ESC / clic fuera valen lo mismo que «Continuar»: guardar lo que tocó, no perderlo.
                submit()
            }}
        >
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
                        Esto quedó según lo que elegiste. Préndelo o apágalo a tu gusto — también
                        puedes cambiarlo después en Opciones → Mi panel.
                    </DialogDescription>
                </DialogHeader>

                <ul className="mt-1 flex flex-col gap-2">
                    {FEATURE_DOMAIN_KEYS.map((domain) => {
                        const Icon = DOMAIN_ICONS[domain]
                        const label = DOMAIN_LABEL[domain]
                        return (
                            <li
                                key={domain}
                                className="flex items-center justify-between gap-4 rounded-control border border-subtle bg-background p-3"
                            >
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <Icon
                                        className="size-4 shrink-0 text-[var(--sport-600)]"
                                        aria-hidden="true"
                                    />
                                    <p className="min-w-0 text-[13px] font-semibold text-[var(--text-strong)]">
                                        {label}
                                    </p>
                                </div>
                                <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                                    <span className="sr-only">Mostrar {label}</span>
                                    <Switch
                                        checked={state[domain]}
                                        disabled={isPending}
                                        onCheckedChange={(next) =>
                                            setState((current) => ({ ...current, [domain]: next }))
                                        }
                                    />
                                </label>
                            </li>
                        )
                    })}
                </ul>

                <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-subtle)]">
                    Lo que apagues se oculta del menú, no se borra.
                </p>

                {error ? (
                    <p
                        role="alert"
                        className="rounded-control border border-subtle bg-surface-sunken px-3 py-2 text-[12.5px] leading-relaxed text-[var(--text-muted)]"
                    >
                        {error}
                    </p>
                ) : null}

                <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {error ? (
                        <button
                            type="button"
                            onClick={close}
                            disabled={isPending}
                            className="inline-flex h-11 touch-manipulation items-center justify-center rounded-control border border-subtle px-4 text-[13.5px] font-bold text-[var(--text-strong)] transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] disabled:opacity-60"
                        >
                            Continuar sin guardar
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={submit}
                        disabled={isPending}
                        className={cn(
                            'inline-flex h-11 touch-manipulation items-center justify-center rounded-control px-5 text-[13.5px] font-bold',
                            'bg-[var(--cta-fill)] text-[var(--text-on-sport)] motion-safe:transition-colors hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)]',
                            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)] disabled:opacity-70'
                        )}
                    >
                        {isPending ? 'Guardando…' : error ? 'Reintentar' : 'Continuar'}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
