import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { WorkoutExecutionClient } from './WorkoutExecutionClient'

export const metadata: Metadata = { title: 'Rutina | EVA' }

interface Props {
    params: Promise<{ coach_slug: string; planId: string }>
}

export default async function WorkoutExecutionPage({ params }: Props) {
    const { coach_slug, planId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    interface ExerciseType {
        id: string
        name: string
        muscle_group: string
        video_url: string | null
        gif_url: string | null
        instructions: string[] | null
    }

    interface BlockType {
        id: string
        order_index: number
        sets: number
        reps: string
        target_weight_kg: number | null
        tempo: string | null
        rir: string | null
        rest_time: string | null
        notes: string | null
        section: 'warmup' | 'main' | 'cooldown' | null
        superset_group: string | null
        progression_type: 'weight' | 'reps' | null
        progression_value: number | null
        is_override: boolean
        exercises: ExerciseType | ExerciseType[]
    }

    interface PlanType {
        id: string
        title: string
        assigned_date: string
        day_of_week: number | null
        week_variant: 'A' | 'B' | null
        program_id: string | null
        workout_blocks: BlockType[]
    }

    interface ProgramType {
        id: string
        name: string
        program_phases: { name: string; weeks: number; color?: string }[] | null
        program_structure_type: 'weekly' | 'cycle' | null
        cycle_length: number | null
        ab_mode: boolean | null
        start_date: string | null
        weeks_to_repeat: number
    }

    const { data: rawPlan } = await supabase
        .from('workout_plans')
        .select(`
            id, title, assigned_date, day_of_week, week_variant, program_id,
            workout_blocks (
                id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, notes, section, superset_group, progression_type, progression_value, is_override,
                exercises ( id, name, muscle_group, video_url, gif_url, instructions )
            )
        `)
        .eq('id', planId)
        .eq('client_id', user.id)
        .maybeSingle()

    if (!rawPlan) redirect(`/c/${coach_slug}/dashboard`)

    const plan = rawPlan as unknown as PlanType
    if (plan.program_id) {
        const { data: activeProgramForUser } = await supabase
            .from('workout_programs')
            .select('id')
            .eq('client_id', user.id)
            .eq('id', plan.program_id)
            .eq('is_active', true)
            .maybeSingle()
        if (!activeProgramForUser) {
            redirect(`/c/${coach_slug}/dashboard`)
        }
    }

    let program: ProgramType | null = null
    if (plan.program_id) {
        const { data: rawProgram } = await supabase
            .from('workout_programs')
            .select('id, name, program_phases, program_structure_type, cycle_length, ab_mode, start_date, weeks_to_repeat')
            .eq('id', plan.program_id)
            .eq('client_id', user.id)
            .maybeSingle()
        program = (rawProgram as ProgramType | null) ?? null
    }

    // Fetch logs for this plan to show completion status
    const blockIds = plan.workout_blocks.map(b => b.id)
    let logs: Array<{
        block_id: string
        set_number: number
        weight_kg: number | null
        reps_done: number | null
        rpe: number | null
    }> = []

    if (blockIds.length > 0) {
        const { data: rawLogs } = await supabase
            .from('workout_logs')
            .select('block_id, set_number, weight_kg, reps_done, rpe')
            .in('block_id', blockIds)
        
        logs = (rawLogs || []) as typeof logs
    }

    // Fetch previous lifting history for these exercises
    const exerciseIds = plan.workout_blocks
        .map(b => Array.isArray(b.exercises) ? b.exercises[0]?.id : b.exercises?.id)
        .filter(Boolean) as string[]

    const previousHistory: Record<string, { weight_kg: number | null, reps_done: number | null, date: string }[]> = {}

    if (exerciseIds.length > 0) {
        const { data: historyData } = await supabase
            .from('workout_logs')
            .select(`
                weight_kg, reps_done, logged_at, set_number,
                workout_blocks!inner(exercise_id)
            `)
            .eq('client_id', user.id)
            .in('workout_blocks.exercise_id', exerciseIds)
            .not('block_id', 'in', `(${blockIds.join(',')})`) // exclude current plan's logs
            .order('logged_at', { ascending: false })
            .limit(200)

        if (historyData) {
            historyData.forEach((log: any) => {
                const exId = log.workout_blocks?.exercise_id
                if (!exId) return
                if (!previousHistory[exId]) {
                    previousHistory[exId] = []
                }
                // Only keep the most recent session's logs for each exercise
                const logDate = log.logged_at.split('T')[0]
                const existingDates = previousHistory[exId].map(h => h.date)
                
                if (existingDates.length === 0 || existingDates.includes(logDate)) {
                    previousHistory[exId].push({
                        weight_kg: log.weight_kg,
                        reps_done: log.reps_done,
                        date: logDate
                    })
                }
            })
        }
    }

    return <WorkoutExecutionClient plan={plan} program={program} logs={logs} previousHistory={previousHistory} coachSlug={coach_slug} />
}
