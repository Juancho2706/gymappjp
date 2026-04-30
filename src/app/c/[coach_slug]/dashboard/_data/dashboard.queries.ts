import { cache } from 'react'
import { format, subDays } from 'date-fns'
import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/database.types'
import { getTodayInSantiago } from '@/lib/date-utils'
import { measureServer } from '@/lib/perf/measure-server'

type CoachBrand = Pick<Tables<'coaches'>, 'brand_name' | 'primary_color' | 'logo_url' | 'welcome_message' | 'welcome_modal_enabled' | 'welcome_modal_content' | 'welcome_modal_type' | 'welcome_modal_version'>

export type DashboardClient = Pick<Tables<'clients'>, 'id' | 'full_name' | 'coach_id'> & {
    coaches: CoachBrand | CoachBrand[] | null
}

export const getClientProfile = cache(async (userId: string) => {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, coach_id, coaches ( brand_name, primary_color, logo_url, welcome_message, welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version )')
        .eq('id', userId)
        .maybeSingle()
    return { client: data as DashboardClient | null, error }
})

export const getDashboardStreak = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('get_client_current_streak' as never, {
        p_client_id: clientId,
    } as never)
    if (error) return 0
    const n = typeof data === 'number' ? data : Number(data)
    return Number.isFinite(n) ? n : 0
})

export const getLastCheckIn = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('check_ins')
        .select('id, weight, energy_level, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    return data
})

export const getCheckInHistory30Days = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { iso } = getTodayInSantiago()
    const anchor = parseISOAnchor(iso)
    const thirtyDaysAgo = subDays(anchor, 30)
    const { data } = await supabase
        .from('check_ins')
        .select('id, weight, energy_level, created_at')
        .eq('client_id', clientId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true })
    return data ?? []
})

function parseISOAnchor(iso: string) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0, 0)
}

export type ActiveProgramRow = Tables<'workout_programs'> & {
    workout_plans: Array<
        Pick<Tables<'workout_plans'>, 'id' | 'title' | 'day_of_week' | 'week_variant' | 'assigned_date'> & {
            workout_blocks: Array<
                Pick<Tables<'workout_blocks'>, 'id' | 'sets' | 'reps' | 'exercise_id'> & {
                    exercises: Pick<Tables<'exercises'>, 'id' | 'name'> | null
                }
            >
        }
    >
}

export const getActiveProgram = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('workout_programs')
        .select(
            `
            id, name, start_date, end_date, weeks_to_repeat, ab_mode, program_phases,
            workout_plans (
                id, title, day_of_week, week_variant, assigned_date,
                workout_blocks ( id, sets, reps, exercise_id, exercises ( id, name ) )
            )
        `
        )
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle()
    return (data as ActiveProgramRow | null) ?? null
})

/** Planes sueltos y de programa (mismo criterio que el dashboard legacy). */
export const getClientWorkoutPlans = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('workout_plans')
        .select('id, title, assigned_date, group_name, day_of_week, week_variant, program_id, created_at')
        .eq('client_id', clientId)
        .order('assigned_date', { ascending: false })
    return data ?? []
})

export type RecentWorkoutLog = {
    id: string
    logged_at: string
    block_id: string
    set_number: number
    weight_kg: number | null
    reps_done: number | null
    workout_blocks: { plan_id: string | null } | null
}

export const getRecentWorkoutLogs = cache(async (clientId: string): Promise<RecentWorkoutLog[]> => {
    const supabase = await createClient()
    const { iso } = getTodayInSantiago()
    const thirtyDaysAgo = subDays(parseISOAnchor(iso), 30)
    const { data } = await supabase
        .from('workout_logs')
        .select('id, logged_at, block_id, set_number, weight_kg, reps_done, workout_blocks!inner(plan_id)')
        .eq('client_id', clientId)
        .gte('logged_at', thirtyDaysAgo.toISOString())
        .order('logged_at', { ascending: false })
        .limit(200)
    return (data ?? []) as unknown as RecentWorkoutLog[]
})

export const getActiveNutritionPlan = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { data } = await supabase
        .from('nutrition_plans')
        .select('id, name, daily_calories, protein_g, carbs_g, fats_g')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle()
    return data
})

export const getTodayNutritionBundle = cache(async (clientId: string, planId: string, todayISO: string) => {
    const supabase = await createClient()
    const [{ data: dailyLog }, { data: meals }] = await Promise.all([
        supabase
            .from('daily_nutrition_logs')
            .select('id, log_date, target_calories_at_log, target_protein_at_log, target_carbs_at_log, target_fats_at_log, nutrition_meal_logs ( id, is_completed, meal_id, consumed_quantity ), nutrition_meal_food_swaps ( meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit )')
            .eq('client_id', clientId)
            .eq('plan_id', planId)
            .eq('log_date', todayISO)
            .maybeSingle(),
        supabase
            .from('nutrition_meals')
            .select(
                `
            id, name, order_index, day_of_week,
            food_items (
              quantity, unit, swap_options,
              foods ( name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit )
            )
          `
            )
            .eq('plan_id', planId)
            .order('order_index', { ascending: true }),
    ])
    return { dailyLog, meals: meals ?? [] }
})

export type PersonalRecordItem = {
    exerciseId: string
    exerciseName: string
    weightKg: number
    achievedAt: string
}

export const getPersonalRecords = cache(async (clientId: string): Promise<PersonalRecordItem[]> => {
    return measureServer(`getPersonalRecords client=${clientId.slice(0, 8)}`, async () => {
        const supabase = await createClient()
        const { iso } = getTodayInSantiago()
        const fourteenAgo = subDays(parseISOAnchor(iso), 14)

        const { data: recentLogs } = await supabase
            .from('workout_logs')
            .select('weight_kg, block_id, logged_at')
            .eq('client_id', clientId)
            .not('weight_kg', 'is', null)
            .gte('logged_at', fourteenAgo.toISOString())
            .order('logged_at', { ascending: false })
            .limit(120)

        const { data: histLogs } = await supabase
            .from('workout_logs')
            .select('weight_kg, block_id')
            .eq('client_id', clientId)
            .not('weight_kg', 'is', null)
            .limit(3000)

        const recent = recentLogs ?? []
        const allW = histLogs ?? []
        if (recent.length === 0) return []

        const blockIds = [...new Set([...recent.map((r) => r.block_id), ...allW.map((r) => r.block_id)])]
        if (blockIds.length === 0) return []

        const { data: blocks } = await supabase
            .from('workout_blocks')
            .select('id, exercise_id')
            .in('id', blockIds)

        const blockToEx = new Map<string, string>()
        for (const b of blocks ?? []) {
            blockToEx.set(b.id, b.exercise_id)
        }

        const exIds = [...new Set([...blockToEx.values()])]
        const { data: exercises } = await supabase.from('exercises').select('id, name').in('id', exIds)
        const exName = new Map<string, string>()
        for (const e of exercises ?? []) exName.set(e.id, e.name)

        const maxByExercise = new Map<string, number>()
        for (const row of allW) {
            const exId = blockToEx.get(row.block_id)
            if (!exId || row.weight_kg == null) continue
            const prev = maxByExercise.get(exId) ?? 0
            if (row.weight_kg > prev) maxByExercise.set(exId, row.weight_kg)
        }

        const prs: PersonalRecordItem[] = []
        const seen = new Set<string>()
        for (const row of recent) {
            const exId = blockToEx.get(row.block_id)
            if (!exId || row.weight_kg == null) continue
            const histMax = maxByExercise.get(exId)
            if (histMax == null || row.weight_kg < histMax) continue
            if (seen.has(exId)) continue
            seen.add(exId)
            prs.push({
                exerciseId: exId,
                exerciseName: exName.get(exId) ?? 'Ejercicio',
                weightKg: row.weight_kg,
                achievedAt: row.logged_at,
            })
        }

        prs.sort((a, b) => b.weightKg - a.weightKg)
        return prs.slice(0, 5)
    })
})

/** Días con al menos un daily_nutrition_log en los últimos 30 días (zona Santiago). */
export const getNutritionLogDays30 = cache(async (clientId: string) => {
    const supabase = await createClient()
    const { iso } = getTodayInSantiago()
    const thirtyDaysAgoStr = format(subDays(parseISOAnchor(iso), 30), 'yyyy-MM-dd')
    const { data } = await supabase
        .from('daily_nutrition_logs')
        .select('log_date')
        .eq('client_id', clientId)
        .gte('log_date', thirtyDaysAgoStr)
    return new Set((data ?? []).map((r) => r.log_date)).size
})
