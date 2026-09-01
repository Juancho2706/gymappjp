import Link from 'next/link'
import { SlidersHorizontal } from 'lucide-react'
import { FUNCIONES_PATH, domainOffCopy } from '@/lib/domain-off'
import type { FeatureDomain } from '@eva/feature-prefs'

/**
 * DomainOffNotice — aviso IN-PAGE cuando el coach entra a una superficie de un dominio que ÉL
 * MISMO apagó en Opciones › Mi panel (Ola de orden W1, mockup `9801fec7` decisión 3A).
 *
 * NO confundir con `ModuleOffNotice`, que vive al lado:
 *   - `ModuleOffNotice` = el módulo de pago no está habilitado para el tenant (entitlement /
 *     kill-switch de operador). Es plata: su CTA va a `/coach/subscription`.
 *   - `DomainOffNotice` (esto) = PREFERENCIA del propio coach. No hay plan, ni precio, ni
 *     urgencia: apagó una función y se la ofrecemos de vuelta con un click. Sus datos siguen
 *     intactos (lo dice el copy) y sus permisos también: esto es VISIBILIDAD, nunca autorización
 *     — RLS y los entitlements reales no se tocan.
 *
 * Precedencia (SPEC W1): la preferencia se evalúa ANTES que el módulo, así que un coach que
 * apagó Cardio ve este aviso aunque además le falte el módulo; el `ModuleOffNotice` queda como
 * kill-switch de operador debajo.
 *
 * El copy sale entero de `domainOffCopy` (`@eva/feature-prefs`) para que web y RN digan las
 * MISMAS palabras y W3 pueda renombrar la pantalla en un solo lugar. El ícono de interruptores
 * (`SlidersHorizontal`) evoca el panel de funciones, no una puerta cerrada.
 *
 * Server component (sin estado). Tokens del DS (color de marca del coach), dark mode incluido.
 */
export function DomainOffNotice({ domain }: { domain: FeatureDomain }) {
    const copy = domainOffCopy(domain)

    return (
        <div
            data-testid="domain-off-notice"
            className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center"
        >
            <div className="flex size-12 items-center justify-center rounded-[14px] bg-surface-sunken text-subtle">
                <SlidersHorizontal className="size-6" />
            </div>
            <h1 className="font-display text-xl font-extrabold tracking-[-0.02em] text-strong">{copy.title}</h1>
            <p className="text-sm text-muted">{copy.body}</p>
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Link
                    href={FUNCIONES_PATH}
                    className="flex min-h-12 items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] px-[18px] text-[15px] font-bold text-[var(--text-on-sport)] shadow-[var(--shadow-sm)] transition-all hover:opacity-90 active:scale-[0.97]"
                >
                    {copy.cta}
                </Link>
                <Link
                    href="/coach/dashboard"
                    className="flex min-h-12 items-center justify-center gap-2 rounded-control border border-default bg-surface-card px-[18px] text-[15px] font-bold text-strong transition-colors hover:bg-surface-sunken active:scale-[0.97]"
                >
                    Volver al inicio
                </Link>
            </div>
        </div>
    )
}
