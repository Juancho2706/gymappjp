'use client'

import { ClientProfileHero } from './[clientId]/ClientProfileHero'
import { ClientProfileDashboard } from './[clientId]/ClientProfileDashboard'
import type { ClientFichaPanelBundle } from './[clientId]/_data/ficha-panel.data'

/**
 * Panel derecho del master-detail de Alumnos (desktop): renderiza la ficha REAL del
 * alumno seleccionado reutilizando los componentes vivos de la ruta
 * `/coach/clients/[clientId]` (ClientProfileHero + ClientProfileDashboard) con el bundle
 * de datos reales (server action `getClientFichaPanel`). Sin mocks. Los accesos a módulos
 * (cardio / screening / composición) van como botones-ícono dentro del hero (gateados por
 * `moduleFlags`), no como una fila de links etiquetados.
 */
export function CoachFichaPanel({ bundle }: { bundle: ClientFichaPanelBundle }) {
    const { hero, moduleFlags } = bundle

    // Fondo de la ficha = `surface-app` que SIGUE el tema (negro en oscuro, claro en claro —
    // NO forzado a dark). El hero sigue siendo inverse (card oscura de identidad, intencional).
    // `-m-5 lg:-m-6` sangra el padding del panel del master-detail para que el fondo llene la
    // región de scroll borde a borde; `p-5 lg:p-6` reintroduce el padding del contenido.
    return (
        <div
            className="-m-5 min-h-[calc(100dvh-60px)] space-y-8 bg-[var(--surface-app)] p-5 lg:-m-6 lg:p-6"
        >
            <ClientProfileHero
                clientId={bundle.clientId}
                client={hero.client}
                compliance={hero.compliance}
                profileLastActivityAt={hero.profileLastActivityAt}
                attentionScore={hero.attentionScore}
                currentWeightKg={hero.currentWeightKg}
                weightDeltaKg={hero.weightDeltaKg}
                nutritionPlansLength={hero.nutritionPlansLength}
                nutritionFirstPlanId={hero.nutritionFirstPlanId}
                activeProgramName={hero.activeProgramName}
                moduleFlags={moduleFlags}
            />

            <ClientProfileDashboard
                moduleFlags={moduleFlags}
                data={bundle.data}
                coachNutrientTargets={bundle.coachNutrientTargets}
                coachPrivateNotes={bundle.coachPrivateNotes}
                coachMealComments={bundle.coachMealComments}
                nutritionProEnabled={bundle.nutritionProEnabled}
                nutritionDomainEnabled={bundle.nutritionDomainEnabled}
                nutritionSectionFlags={bundle.nutritionSectionFlags}
                nutritionOverrideContext={bundle.nutritionOverrideContext}
            />
        </div>
    )
}
