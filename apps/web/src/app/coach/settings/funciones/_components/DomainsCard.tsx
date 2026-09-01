'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Apple, ArrowUpRight, Dumbbell, HeartPulse, PersonStanding, Ruler } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FeatureDomain } from '@eva/feature-prefs'
import { buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { setMiPanelDomainAction } from '../_actions/mi-panel.actions'
import { domainOpenHref } from '../_lib/domain-open-routes'
import { BodycompClientPicker } from './BodycompClientPicker'
import type { BodycompClient } from '../_data/bodycomp-clients.queries'

/**
 * «Qué se ve en tu panel» — las 5 areas del coach: master switch + puerta de entrada.
 *
 * Ola de orden W3.1 (decisiones 5A y 6A): la tarjeta salio de `MiPanelClient` para poder montarse
 * tambien en scope TEAM, y cada fila gano un boton «Abrir» — la unica funcion del launcher
 * `/coach/tools`, que esta pantalla absorbe. El «Abrir» aparece SOLO con el dominio prendido: un
 * area apagada no se ve en el menu, asi que ofrecer su puerta seria mentir.
 *
 * Dos decisiones de producto que se ven en el codigo:
 *  - Apagar un dominio oculta su menu y su contenido, NO borra nada. El copy lo dice.
 *  - Composicion corporal no tiene pantalla propia (se mide 1-a-1): su «Abrir» pregunta primero
 *    a que alumno, con el mismo picker que tenia el launcher.
 *
 * En team (`editable={false}`) las filas son de solo lectura: el master switch por dominio del
 * pool se ajusta en el detalle de abajo, no hay accion de escritura por fila.
 *
 * Los iconos se resuelven ACA por key: `funciones.queries.ts` (que tiene los mismos en
 * `DOMAIN_META`) importa service-role y no puede cruzar al bundle del cliente.
 */

const DOMAIN_ICONS: Record<FeatureDomain, LucideIcon> = {
    nutrition: Apple,
    training: Dumbbell,
    cardio: HeartPulse,
    movement: PersonStanding,
    bodycomp: Ruler,
}

export interface MiPanelDomainRow {
    domain: FeatureDomain
    label: string
    description: string
    enabled: boolean
}

export interface DomainsCardProps {
    domains: MiPanelDomainRow[]
    /** Alumnos del workspace activo — solo los usa el picker de Composicion. */
    bodycompClients: BodycompClient[]
    /** `false` = solo lectura (team): sin switch por fila, el «Abrir» sigue disponible. */
    editable?: boolean
}

/** Chrome del «Abrir» — secundario y con target de 44px, igual que el switch de al lado. */
const OPEN_CLASS = cn(
    buttonVariants({ variant: 'secondary', size: 'sm' }),
    'min-h-[44px] shrink-0',
)

export function DomainsCard({ domains, bodycompClients, editable = true }: DomainsCardProps) {
    const router = useRouter()
    const [state, setState] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(domains.map((d) => [d.domain, d.enabled])),
    )
    const [pickerOpen, setPickerOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    function toggle(domain: FeatureDomain, next: boolean) {
        const previous = state[domain] ?? true
        setState((current) => ({ ...current, [domain]: next }))
        startTransition(async () => {
            const result = await setMiPanelDomainAction({ domain, enabled: next })
            if (!result.ok) {
                // Revertir: el switch no puede quedar mostrando algo que la base no guardó.
                setState((current) => ({ ...current, [domain]: previous }))
                toast.error(result.error)
                return
            }
            toast.success(result.message)
        })
    }

    return (
        <section className="rounded-2xl border border-subtle bg-surface-card p-4">
            <h2 className="text-sm font-semibold text-strong">
                {editable ? 'Qué se ve en tu panel' : 'Qué se ve en el panel del equipo'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
                {editable
                    ? 'Apaga lo que no uses: se oculta del menú, para ti y para tus alumnos. No se borra ningún dato y lo puedes volver a prender cuando quieras. Con «Abrir» entras directo.'
                    : 'Estas son las áreas del equipo. Con «Abrir» entras directo; el detalle de nutrición se ajusta más abajo.'}
            </p>

            <ul className="mt-3 space-y-2">
                {domains.map((row) => {
                    const Icon = DOMAIN_ICONS[row.domain]
                    const enabled = state[row.domain] ?? true
                    const href = domainOpenHref(row.domain)
                    return (
                        <li
                            key={row.domain}
                            className="flex items-center justify-between gap-3 rounded-control border border-subtle bg-background p-3"
                        >
                            <div className="flex min-w-0 items-start gap-2.5">
                                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sport-600)]" aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-strong">{row.label}</p>
                                    <p className="mt-0.5 text-xs leading-relaxed text-muted">
                                        {row.description}
                                    </p>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                                {/* «Abrir» solo con el dominio prendido (W3.1, decisión 6A). */}
                                {enabled &&
                                    (href ? (
                                        <Link href={href} className={OPEN_CLASS}>
                                            Abrir
                                            <ArrowUpRight aria-hidden="true" />
                                            <span className="sr-only">{row.label}</span>
                                        </Link>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setPickerOpen(true)}
                                            className={OPEN_CLASS}
                                        >
                                            Abrir
                                            <ArrowUpRight aria-hidden="true" />
                                            <span className="sr-only">{row.label}</span>
                                        </button>
                                    ))}

                                {editable && (
                                    <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                                        <span className="sr-only">Mostrar {row.label}</span>
                                        <Switch
                                            checked={enabled}
                                            disabled={isPending}
                                            onCheckedChange={(next) => toggle(row.domain, next)}
                                        />
                                    </label>
                                )}
                            </div>
                        </li>
                    )
                })}
            </ul>

            <BodycompClientPicker
                open={pickerOpen}
                clients={bodycompClients}
                onOpenChange={setPickerOpen}
                onPick={(id) => {
                    setPickerOpen(false)
                    router.push(`/coach/clients/${id}/bodycomp`)
                }}
            />
        </section>
    )
}
