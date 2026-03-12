import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Client, Exercise } from '@/lib/database.types'
import type { Metadata } from 'next'
import { PlanBuilder } from './PlanBuilder'

export const metadata: Metadata = { title: 'Constructor de Rutina | OmniCoach OS' }

export default async function BuilderPage(
    props: {
        params: Promise<{ clientId: string }>
        searchParams: Promise<{ planId?: string }>
    }
) {
    const searchParams = await props.searchParams;
    const params = await props.params;
    const { clientId } = params
    const { planId } = searchParams
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Verify client belongs to coach
    const { data: rawClient } = await supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
        .eq('coach_id', user.id)
        .maybeSingle()

    if (!rawClient) redirect('/coach/clients')
    const client = rawClient as Pick<Client, 'id' | 'full_name' | 'email'>

    // Fetch all exercises (global + coach's own)
    const { data: rawExercises } = await supabase
        .from('exercises')
        .select('*')
        .or(`coach_id.is.null,coach_id.eq.${user.id}`)
        .order('muscle_group')
        .order('name')

    const exercises = (rawExercises ?? []) as Exercise[]

    let initialPlanData = null
    if (planId) {
        const { data: rawPlan } = await supabase
            .from('workout_plans')
            .select(`
                id, title, group_name,
                workout_blocks (
                    id, exercise_id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, notes,
                    exercises ( name, muscle_group )
                )
            `)
            .eq('id', planId)
            .eq('coach_id', user.id)
            .maybeSingle()
        
        if (rawPlan) {
            initialPlanData = rawPlan
        }
    }

    const { data: groupsData } = await supabase
        .from('workout_plans')
        .select('group_name')
        .eq('coach_id', user.id)
        .not('group_name', 'is', null) as { data: { group_name: string | null }[] | null }

    const existingGroups = Array.from(new Set(groupsData?.map(g => g.group_name).filter(Boolean) as string[]))

    // Fetch previous plans as templates (deduplicated by title for simplicity)
    const { data: rawTemplates } = await supabase
        .from('workout_plans')
        .select(`
            id, title, group_name,
            workout_blocks (
                id, exercise_id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, notes,
                exercises ( name, muscle_group )
            )
        `)
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)

    // Deduplicate templates by title to avoid clutter
    const templates: any[] = []
    const seenTitles = new Set<string>()
    if (rawTemplates) {
        for (const t of rawTemplates as any[]) {
            if (!seenTitles.has(t.title)) {
                seenTitles.add(t.title)
                templates.push(t)
            }
        }
    }

    return <PlanBuilder client={client} exercises={exercises} initialPlan={initialPlanData} existingGroups={existingGroups} templates={templates} />
}
