import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrgBySlug } from '../_data/org.queries'
import { CreateOrgNutritionTemplateForm } from './_components/CreateOrgNutritionTemplateForm'
import { DeleteOrgNutritionTemplateButton } from './_components/DeleteOrgNutritionTemplateButton'

interface Props {
    params: Promise<{ slug: string }>
}

const GOAL_LABELS: Record<string, string> = {
    deficit: 'Déficit',
    maintenance: 'Mantenimiento',
    surplus: 'Volumen',
}

async function getOrgNutritionTemplates(orgId: string) {
    const supabase = await createClient()
    const { data } = await supabase
        .from('org_nutrition_templates')
        .select('id, name, description, goal_type, daily_calories, protein_g, carbs_g, fats_g, meal_names, created_at')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
    return data ?? []
}

export default async function OrgNutritionPage({ params }: Props) {
    const { slug } = await params
    const org = await getOrgBySlug(slug)
    if (!org) redirect('/coach/dashboard')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/coach/dashboard')

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) redirect(`/org/${slug}`)

    const templates = await getOrgNutritionTemplates(org.id)

    return (
        <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Templates Nutricionales</h1>
                    <p className="mt-1 text-sm text-zinc-500">Plantillas base que los coaches de la org pueden usar al crear planes.</p>
                </div>
                <CreateOrgNutritionTemplateForm orgSlug={slug} />
            </div>

            {templates.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-12">Sin templates. Creá el primero arriba.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {templates.map(t => {
                        const mealNames = Array.isArray(t.meal_names) ? (t.meal_names as { name: string }[]) : []
                        return (
                            <div key={t.id} className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{t.name}</p>
                                            {t.goal_type && (
                                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-300">
                                                    {GOAL_LABELS[t.goal_type] ?? t.goal_type}
                                                </span>
                                            )}
                                        </div>
                                        {t.description && <p className="mt-1 text-xs text-zinc-500">{t.description}</p>}
                                        <div className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
                                            {t.daily_calories && <span>{t.daily_calories} kcal</span>}
                                            {t.protein_g && <span>P: {t.protein_g}g</span>}
                                            {t.carbs_g && <span>C: {t.carbs_g}g</span>}
                                            {t.fats_g && <span>G: {t.fats_g}g</span>}
                                        </div>
                                        {mealNames.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {mealNames.map((m, i) => (
                                                    <span key={i} className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                                        {m.name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <DeleteOrgNutritionTemplateButton orgSlug={slug} templateId={t.id} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
