import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, LayoutGrid } from 'lucide-react'
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
        <div className="max-w-4xl mx-auto animate-fade-in mb-24 md:mb-0">
            <div className="flex items-center gap-4 mb-6 md:mb-8">
                <Link href="/coach/dashboard"
                    className="p-2 rounded-xl border border-border hover:bg-muted transition-colors flex-shrink-0">
                    <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                </Link>
                <div className="min-w-0">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <LayoutGrid className="w-5 h-5 text-primary flex-shrink-0" />
                        <span className="truncate">Grupos de Alimentos</span>
                    </h1>
                    <p className="text-sm text-muted-foreground truncate">Crea plantillas de comidas para tus planes nutricionales</p>
                </div>
            </div>

            <MealGroupLibraryClient initialGroups={mealGroups} coachId={coach.id} />
        </div>
    )
}
