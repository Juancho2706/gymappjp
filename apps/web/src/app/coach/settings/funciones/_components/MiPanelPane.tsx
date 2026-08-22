import Link from 'next/link'
import { ArrowRight, Compass } from 'lucide-react'
import { DOMAIN_ENABLED_KEY } from '@eva/feature-prefs'
import { FeaturePrefsPanel } from '@/components/coach/FeaturePrefsPanel'
import { GUIDE_ROUTE } from '@/app/coach/guia/_lib/guide-first-entry'
import { domainsWithSectionEditor, type DomainFuncionesConfig } from '../_data/funciones.queries'
import { getMiPanelContext } from '../_data/mi-panel.queries'
import { MiPanelClient, type MiPanelDomainRow } from './MiPanelClient'

/**
 * Contenido de «Opciones › Mi panel» para el coach STANDALONE. Server component: lo montan tanto
 * la ruta `/coach/settings/funciones` (móvil / link directo) como el panel embebido del hub de
 * Opciones en desktop, sin duplicar layout ni lecturas (las dos queries son `React.cache`).
 *
 * Abajo de todo sigue el editor FINO de secciones (`FeaturePrefsPanel`), que hoy solo tiene
 * sentido en Nutrición: el resto de los dominios son master switch puro y ya viven arriba.
 *
 * Arriba de todo, el camino de vuelta a `/coach/guia` (QA del owner 22-08). La guía es una
 * pantalla propia desde el 22-08 y su píldora se apaga sola al completarse, al descartarse o al
 * ocultarse: sin esta entrada, un coach que la cerró se quedaba sin ninguna forma de volver que
 * no fuera escribir la URL a mano.
 */
export async function MiPanelPane({ domains }: { domains: DomainFuncionesConfig[] }) {
    const ctx = await getMiPanelContext()

    const rows: MiPanelDomainRow[] = domains.map((domain) => ({
        domain: domain.domain,
        label: domain.label,
        description: domain.description,
        // Sin la key `_enabled` el dominio está PRENDIDO (fail-open, igual que el resolver).
        enabled: domain.sectionPrefs[DOMAIN_ENABLED_KEY] ?? true,
    }))

    const sectionDomains = domainsWithSectionEditor(domains)

    return (
        <div className="space-y-6">
            <Link
                href={GUIDE_ROUTE}
                className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-subtle bg-surface-card p-4 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
            >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--sport-100)] text-[var(--sport-600)]">
                    <Compass className="size-[18px]" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-strong">Ver mi guía de inicio</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                        Tus primeros pasos, siempre disponibles. Aunque ya la hayas terminado o cerrado.
                    </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
            </Link>

            <MiPanelClient
                persona={ctx.persona}
                alsoOther={ctx.alsoOther}
                domains={rows}
                hasDemo={ctx.demoClientId != null}
            />

            {sectionDomains.length > 0 && (
                <div className="space-y-3">
                    <div className="px-1">
                        <h2 className="text-sm font-semibold text-strong">Detalle de nutrición</h2>
                        <p className="mt-1 text-xs leading-relaxed text-muted">
                            Qué tan a fondo la trabajas y qué secciones ven tus alumnos.
                        </p>
                    </div>
                    <FeaturePrefsPanel scope="coach" domains={sectionDomains} />
                </div>
            )}
        </div>
    )
}
