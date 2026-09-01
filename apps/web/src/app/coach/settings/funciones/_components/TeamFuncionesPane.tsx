import { DOMAIN_ENABLED_KEY } from '@eva/feature-prefs'
import { FeaturePrefsPanel } from '@/components/coach/FeaturePrefsPanel'
import { domainsWithSectionEditor, type DomainFuncionesConfig } from '../_data/funciones.queries'
import { getBodycompClients } from '../_data/bodycomp-clients.queries'
import { DomainsCard, type MiPanelDomainRow } from './DomainsCard'

/**
 * Contenido de «Funciones del equipo» — el espejo de `MiPanelPane` para el scope TEAM. Lo montan
 * la ruta `/coach/settings/funciones` y el pane embebido del hub de Opciones en desktop, para que
 * las dos superficies muestren exactamente lo mismo (las queries son `React.cache`).
 *
 * El equipo no tiene persona ni alumno de ejemplo: quedan las áreas del pool + el detalle fino de
 * nutrición. Las filas de área van de SOLO LECTURA (`editable={false}`): no existe write-action
 * de master switch por dominio para el pool, y el único interruptor real del equipo —el de
 * nutrición— vive dentro del editor de secciones de abajo. Lo que SÍ conservan es el botón
 * «Abrir», que era lo único que hacía el launcher `/coach/tools` (Ola de orden W3.1).
 */
export async function TeamFuncionesPane({
    teamId,
    domains,
}: {
    teamId: string
    domains: DomainFuncionesConfig[]
}) {
    const bodycompClients = await getBodycompClients()

    const rows: MiPanelDomainRow[] = domains.map((domain) => ({
        domain: domain.domain,
        label: domain.label,
        description: domain.description,
        // Sin la key `_enabled` el dominio está PRENDIDO (fail-open, igual que el resolver).
        enabled: domain.sectionPrefs[DOMAIN_ENABLED_KEY] ?? true,
    }))

    return (
        <div className="space-y-6">
            <DomainsCard domains={rows} bodycompClients={bodycompClients} editable={false} />
            <FeaturePrefsPanel
                scope="team"
                teamId={teamId}
                domains={domainsWithSectionEditor(domains)}
            />
        </div>
    )
}
