import { DOMAIN_ENABLED_KEY } from '@eva/feature-prefs'
import { FeaturePrefsPanel } from '@/components/coach/FeaturePrefsPanel'
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
