import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Info } from 'lucide-react'
import { MealGroupLibraryClient } from './MealGroupLibraryClient'
import { getCoach } from '@/lib/coach/get-coach'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { getMealGroups } from './_data/meal-groups.queries'

export default async function CoachMealGroupsPage() {
    const coach = await getCoach()
    if (!coach) redirect('/login')

    const workspace = await getPreferredWorkspaceForRender(coach.id)
    const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null
    const mealGroups = await getMealGroups(coach.id, orgId)

    return (
        <div className="max-w-3xl mx-auto animate-fade-in mb-24 md:mb-0 space-y-4">
            <div className="flex items-center gap-3">
                <Link
                    href="/coach/nutrition-plans"
                    aria-label="Volver a Nutrición"
                    className="eva-press flex h-9 w-9 shrink-0 items-center justify-center rounded-control border-[1.5px] border-default bg-surface-card text-strong transition-colors hover:bg-surface-sunken"
                >
                    <ArrowLeft className="h-[18px] w-[18px]" />
                </Link>
                <div className="min-w-0">
                    <h1 className="truncate font-display text-2xl font-extrabold leading-tight tracking-[-0.02em] text-strong">
                        Grupos de comidas
                    </h1>
                    <p className="truncate text-[13px] text-muted">Combos de alimentos reutilizables</p>
                </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-card bg-surface-sunken px-3.5 py-2.5">
                <Info className="mt-0.5 h-[15px] w-[15px] shrink-0 text-muted" />
                <span className="text-xs leading-relaxed text-muted">
                    Un grupo agrupa varios alimentos para insertarlos de una en cualquier comida del plan.
                </span>
            </div>

            <MealGroupLibraryClient initialGroups={mealGroups} coachId={coach.id} />
        </div>
    )
}
