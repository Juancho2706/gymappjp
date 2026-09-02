'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
    Apple,
    ArrowUpRight,
    ChevronDown,
    ChevronUp,
    Dumbbell,
    HeartPulse,
    PersonStanding,
    Ruler,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { moveNavOrder, resolveNavOrder, type FeatureDomain } from '@eva/feature-prefs'
import type { Persona } from '@eva/schemas'
import { buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { setMiPanelDomainAction, setNavOrderAction, setTeamDomainAction } from '../_actions/mi-panel.actions'
import { domainOpenHref } from '../_lib/domain-open-routes'
import { BodycompClientPicker } from './BodycompClientPicker'
import type { BodycompClient } from '../_data/bodycomp-clients.queries'

/**
 * «Qué se ve en tu panel» — las 5 areas del coach: ORDEN + master switch + puerta de entrada.
 *
 * Ola de orden W3.1 (decisiones 5A y 6A): la tarjeta salio de `MiPanelClient` para poder montarse
 * tambien en scope TEAM, y cada fila gano un boton «Abrir» — la unica funcion del launcher
 * `/coach/tools`, que esta pantalla absorbe. El «Abrir» aparece SOLO con el dominio prendido: un
 * area apagada no se ve en el menu, asi que ofrecer su puerta seria mentir.
 *
 * QA del owner 01-09 (ronda 2), dos cosas nuevas:
 *  - ORDEN EDITABLE (▲▼): la barra del telefono solo tiene dos slots de dominio y hasta hoy los
 *    repartia la especialidad sin apelacion. Ahora el coach decide. Se guarda en la fila reservada
 *    `_nav` de `coach_feature_prefs` (`setNavOrderAction`) y es PERSONAL — el ▲▼ esta tambien en
 *    scope team, porque el telefono es del coach, no del pool.
 *  - SWITCH EN TEAM: el gestor del pool volvio a tener con que apagar un area del equipo
 *    (`setTeamDomainAction`). Sin `canManage` las filas siguen de solo lectura, como antes.
 *
 * Dos decisiones de producto que se ven en el codigo:
 *  - Apagar un dominio oculta su menu y su contenido, NO borra nada. El copy lo dice.
 *  - Composicion corporal no tiene pantalla propia (se mide 1-a-1): su «Abrir» pregunta primero
 *    a que alumno, con el mismo picker que tenia el launcher.
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
    /**
     * Orden PERSONAL guardado por el coach (fila `_nav`). `null` ⇒ manda su especialidad
     * (`resolveNavOrder` cae a `PERSONA_DOMAIN_ORDER`).
     */
    navOrder?: FeatureDomain[] | null
    /** Especialidad del coach — el fallback del orden cuando nunca reordeno. */
    persona?: Persona | null
    /** `'team'` = las filas son del POOL; `'coach'` (default) = las del panel personal. */
    scope?: 'coach' | 'team'
    /** Team activo — lo necesita `setTeamDomainAction`. Solo en scope team. */
    teamId?: string | null
    /** En scope team: `true` = gestor del pool ⇒ las filas traen switch. La RLS es el gate real. */
    canManage?: boolean
}

/** Chrome del «Abrir» — secundario y con target de 44px, igual que el switch de al lado. */
const OPEN_CLASS = cn(
    buttonVariants({ variant: 'secondary', size: 'sm' }),
    'min-h-[44px] shrink-0',
)

/** Chrome de ▲/▼ — target de 44px (pulgar), sin relleno: es cromo de control, no una accion CTA. */
const ARROW_CLASS = cn(
    'flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-subtle',
    'text-muted transition-colors hover:bg-surface-sunken hover:text-strong',
    'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
    'disabled:pointer-events-none disabled:opacity-40',
)

export function DomainsCard({
    domains,
    bodycompClients,
    navOrder = null,
    persona = null,
    scope = 'coach',
    teamId = null,
    // Default fail-closed: en team, sin gestión declarada las filas son de solo lectura.
    canManage = false,
}: DomainsCardProps) {
    const router = useRouter()
    const [state, setState] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(domains.map((d) => [d.domain, d.enabled])),
    )
    // Orden OPTIMISTA: el ▲▼ mueve la fila al instante y la action confirma. Si falla, se revierte
    // (una lista que se queda donde el coach la dejo pero la base no guardo seria una mentira).
    const [order, setOrder] = useState<readonly FeatureDomain[]>(() => resolveNavOrder(navOrder, persona))
    const [pickerOpen, setPickerOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    // ── Resincronizacion con el servidor (QA del owner 02-09, OB5) ───────────────────────────
    // Los dos `useState` de arriba son INICIALIZADORES: corren una vez y despues ignoran las props.
    // Con «Ordenar mi panel segun mi especialidad» el servidor manda un orden Y unos switches
    // nuevos, y la tarjeta seguia pintando los viejos hasta recargar a mano.
    //
    // El guard es la FIRMA de las props, no un `useEffect` a secas: se resincroniza SOLO cuando el
    // servidor de verdad mando otra cosa, asi un ▲▼ o un switch optimista en curso no se pisa con
    // el valor viejo en el re-render siguiente. Es el patron de React para estado derivado (ajuste
    // durante el render): sin efecto y sin un frame con la lista vieja.
    const enabledSignature = domains.map((d) => `${d.domain}:${d.enabled}`).join('|')
    const [syncedEnabled, setSyncedEnabled] = useState(enabledSignature)
    if (syncedEnabled !== enabledSignature) {
        setSyncedEnabled(enabledSignature)
        setState(Object.fromEntries(domains.map((d) => [d.domain, d.enabled])))
    }

    const orderSignature = `${(navOrder ?? []).join('|')}::${persona ?? ''}`
    const [syncedOrder, setSyncedOrder] = useState(orderSignature)
    if (syncedOrder !== orderSignature) {
        setSyncedOrder(orderSignature)
        setOrder(resolveNavOrder(navOrder, persona))
    }

    // El switch existe en standalone siempre; en team solo para el gestor del pool.
    const editable = scope === 'coach' ? true : canManage === true

    // Las filas se pintan en el orden del coach. Un dominio fuera del orden (no deberia pasar:
    // `resolveNavOrder` devuelve los cinco) cae al final conservando su posicion relativa.
    const orderedRows = useMemo(() => {
        const rank = new Map(order.map((domain, index) => [domain as string, index]))
        return [...domains].sort(
            (a, b) =>
                (rank.get(a.domain) ?? Number.MAX_SAFE_INTEGER) -
                (rank.get(b.domain) ?? Number.MAX_SAFE_INTEGER),
        )
    }, [domains, order])

    function toggle(domain: FeatureDomain, next: boolean) {
        const previous = state[domain] ?? true
        setState((current) => ({ ...current, [domain]: next }))
        startTransition(async () => {
            const result =
                scope === 'team'
                    ? teamId
                        ? await setTeamDomainAction({ teamId, domain, enabled: next })
                        : ({ ok: false, error: 'No pudimos identificar tu equipo.' } as const)
                    : await setMiPanelDomainAction({ domain, enabled: next })
            if (!result.ok) {
                // Revertir: el switch no puede quedar mostrando algo que la base no guardó.
                setState((current) => ({ ...current, [domain]: previous }))
                toast.error(result.error)
                return
            }
            toast.success(result.message)
        })
    }

    function move(domain: FeatureDomain, delta: -1 | 1) {
        const previous = order
        const next = moveNavOrder(order, domain, delta)
        // En los bordes `moveNavOrder` devuelve el mismo orden: no se escribe por gusto.
        if (next.join('|') === previous.join('|')) return
        setOrder(next)
        startTransition(async () => {
            const result = await setNavOrderAction({ order: next })
            if (!result.ok) {
                setOrder(previous)
                toast.error(result.error)
            }
            // Sin toast de éxito a propósito: la fila YA se movió delante del coach. Un aviso por
            // cada toque de flecha es ruido sobre una acción que se explica sola.
        })
    }

    return (
        <section className="rounded-2xl border border-subtle bg-surface-card p-4">
            <h2 className="text-sm font-semibold text-strong">
                {scope === 'coach' ? 'Qué se ve en tu panel' : 'Qué se ve en el panel del equipo'}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
                {scope === 'coach'
                    ? 'Apaga lo que no uses: se oculta del menú, para ti y para tus alumnos. No se borra ningún dato y lo puedes volver a prender cuando quieras. Con «Abrir» entras directo.'
                    : editable
                      ? 'Apaga lo que el equipo no use: se oculta del menú para todos los coaches del pool y sus alumnos. No se borra ningún dato y lo puedes volver a prender cuando quieras. Con «Abrir» entras directo.'
                      : 'Estas son las áreas del equipo. Con «Abrir» entras directo; el detalle de nutrición se ajusta más abajo.'}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
                Los dos primeros que estén prendidos van a la barra del teléfono.
            </p>

            <ul className="mt-3 space-y-2">
                {orderedRows.map((row, index) => {
                    const Icon = DOMAIN_ICONS[row.domain]
                    const enabled = state[row.domain] ?? true
                    const href = domainOpenHref(row.domain)
                    return (
                        <li
                            key={row.domain}
                            className="rounded-control border border-subtle bg-background p-3"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-start gap-2.5">
                                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sport-600)]" aria-hidden="true" />
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold text-strong">{row.label}</p>
                                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                                            {row.description}
                                        </p>
                                    </div>
                                </div>

                                {editable && (
                                    // `Switch` (base-ui) renderiza <button role="switch">, que NO es
                                    // un elemento etiquetable: envolverlo en un <label> con sr-only
                                    // no le daba nombre accesible. El nombre va por `aria-label`
                                    // directo al control; el <div> queda SOLO como blanco táctil 44×44.
                                    <div className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
                                        <Switch
                                            aria-label={`Mostrar ${row.label}`}
                                            checked={enabled}
                                            disabled={isPending}
                                            onCheckedChange={(next) => toggle(row.domain, next)}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="mt-1.5 flex items-center justify-between gap-2">
                                {/* Reordenar es PERSONAL: está también en team (la barra es del
                                    coach, no del pool). Deshabilitado en los bordes. */}
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        aria-label={`Subir ${row.label}`}
                                        disabled={isPending || index === 0}
                                        onClick={() => move(row.domain, -1)}
                                        className={ARROW_CLASS}
                                    >
                                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Bajar ${row.label}`}
                                        disabled={isPending || index === orderedRows.length - 1}
                                        onClick={() => move(row.domain, 1)}
                                        className={ARROW_CLASS}
                                    >
                                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>

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
