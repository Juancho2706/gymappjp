import { DOMAIN_ENABLED_KEY, type FeatureDomain } from '@eva/feature-prefs'
import { FeaturePrefsPanel } from '@/components/coach/FeaturePrefsPanel'
import { domainsWithSectionEditor, type DomainFuncionesConfig } from '../_data/funciones.queries'
import { getBodycompClients } from '../_data/bodycomp-clients.queries'
import { getMiPanelContext } from '../_data/mi-panel.queries'
import { DomainsCard, type MiPanelDomainRow } from './DomainsCard'

/**
 * Contenido de «Funciones del equipo» — el espejo de `MiPanelPane` para el scope TEAM. Lo montan
 * la ruta `/coach/settings/funciones` y el pane embebido del hub de Opciones en desktop, para que
 * las dos superficies muestren exactamente lo mismo (las queries son `React.cache`).
 *
 * El equipo no tiene persona ni alumno de ejemplo: quedan las áreas del pool + el detalle fino de
 * nutrición. Hasta el QA del owner del 01-09 las filas eran de SOLO LECTURA, porque no existía
 * write-action de master switch por dominio para el pool: el gestor no tenía dónde apagar un área
 * del equipo. Ahora existe (`setTeamDomainAction`) y las filas traen switch cuando `canManage`
 * — la RLS de `team_feature_prefs` (managers) sigue siendo el gate real, la UI solo deja de
 * ofrecer un affordance falso al miembro común.
 *
 * El ▲▼ de la tarjeta, en cambio, es PERSONAL: reordena la barra del teléfono de ESTE coach
 * (`coach_feature_prefs._nav`), no la del pool. Por eso hace falta su persona — el fallback del
 * orden cuando nunca reordenó.
 */
export async function TeamFuncionesPane({
    teamId,
    domains,
    navOrder = null,
    canManage = false,
}: {
    teamId: string
    domains: DomainFuncionesConfig[]
    /** Orden PERSONAL de la barra (fila `_nav`) — vale también dentro del pool. */
    navOrder?: FeatureDomain[] | null
    /** `true` = gestor del pool: las filas traen switch. */
    canManage?: boolean
}) {
    // `getMiPanelContext` es `React.cache`: acá se usa SOLO por la persona (el fallback del orden
    // de la barra). El equipo no tiene especialidad ni alumno de ejemplo.
    const [bodycompClients, personal] = await Promise.all([getBodycompClients(), getMiPanelContext()])

    const rows: MiPanelDomainRow[] = domains.map((domain) => ({
        domain: domain.domain,
        label: domain.label,
        description: domain.description,
        // Sin la key `_enabled` el dominio está PRENDIDO (fail-open, igual que el resolver).
        enabled: domain.sectionPrefs[DOMAIN_ENABLED_KEY] ?? true,
    }))

    return (
        <div className="space-y-6">
            <DomainsCard
                domains={rows}
                bodycompClients={bodycompClients}
                navOrder={navOrder}
                persona={personal.persona}
                scope="team"
                teamId={teamId}
                canManage={canManage}
            />
            <FeaturePrefsPanel
                scope="team"
                teamId={teamId}
                domains={domainsWithSectionEditor(domains)}
            />
        </div>
    )
}
