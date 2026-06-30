'use client'

import Link from 'next/link'
import { HeartPulse, PersonStanding, Scale, ChevronRight } from 'lucide-react'
import { ClientProfileHero } from './[clientId]/ClientProfileHero'
import { ClientProfileDashboard } from './[clientId]/ClientProfileDashboard'
import type { ClientFichaPanelBundle } from './[clientId]/_data/ficha-panel.data'

/**
 * Panel derecho del master-detail de Alumnos (desktop): renderiza la ficha REAL del
 * alumno seleccionado reutilizando los componentes vivos de la ruta
 * `/coach/clients/[clientId]` (ClientProfileHero + ClientProfileDashboard) con el bundle
 * de datos reales (server action `getClientFichaPanel`). Sin mocks.
 */
export function CoachFichaPanel({ bundle }: { bundle: ClientFichaPanelBundle }) {
    const { clientId, data, hero, moduleFlags } = bundle

    const links = [
        moduleFlags.cardio
            ? { href: `/coach/cardio/${clientId}`, label: 'Perfil cardio', Icon: HeartPulse }
            : null,
        moduleFlags.movement
            ? {
                  href: `/coach/movement/${clientId}`,
                  label: 'Screening de movimiento',
                  Icon: PersonStanding,
              }
            : null,
        moduleFlags.bodycomp
            ? {
                  href: `/coach/clients/${clientId}/bodycomp`,
                  label: 'Composición corporal',
                  Icon: Scale,
              }
            : null,
    ].filter((l): l is { href: string; label: string; Icon: typeof HeartPulse } => l !== null)

    return (
        <div className="space-y-8">
            <ClientProfileHero
                clientId={clientId}
                client={hero.client}
                compliance={hero.compliance}
                profileLastActivityAt={hero.profileLastActivityAt}
                attentionScore={hero.attentionScore}
                currentWeightKg={hero.currentWeightKg}
                weightDeltaKg={hero.weightDeltaKg}
                nutritionPlansLength={hero.nutritionPlansLength}
                nutritionFirstPlanId={hero.nutritionFirstPlanId}
            />

            {links.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {links.map(({ href, label, Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            className="group flex min-h-[44px] items-center gap-2 rounded-control border border-subtle bg-surface-card px-4 text-sm font-semibold text-body shadow-[var(--shadow-sm)] transition-all hover:border-default hover:bg-surface-sunken"
                        >
                            <Icon className="h-4 w-4 text-sport-600" />
                            {label}
                            <ChevronRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    ))}
                </div>
            )}

            <ClientProfileDashboard
                data={data}
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
