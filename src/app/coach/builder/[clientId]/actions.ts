'use server'

import { createClient } from '@/lib/supabase/server'
import { createRawAdminClient } from '@/lib/supabase/admin-raw'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const blockSchema = z.object({
    exercise_id: z.string().uuid(),
    sets: z.coerce.number().int().min(1).max(20),
    reps: z.string().min(1).max(20),
    target_weight_kg: z.coerce.number().min(0).optional(),
    tempo: z.string().max(20).optional(),
    rir: z.string().max(10).optional(),
    rest_time: z.string().max(20).optional(),
    notes: z.string().max(200).optional(),
})

const planSchema = z.object({
    title: z.string().min(2, 'El título es requerido').max(100),
    group_name: z.string().min(1, 'Debes seleccionar o crear un grupo').max(100),
    client_id: z.string().uuid(),
    blocks: z.array(blockSchema).min(1, 'Agrega al menos un ejercicio'),
})

export type PlanState = {
    error?: string
    planId?: string
}

export async function createPlanAction(payload: {
    planId?: string
    title: string
    group_name: string
    clientId: string
    blocks: Array<{
        exercise_id: string
        sets: number
        reps: string
        target_weight_kg?: number
        tempo?: string
        rir?: string
        rest_time?: string
        notes?: string
    }>
}): Promise<PlanState> {
    const parsed = planSchema.safeParse({
        title: payload.title,
        group_name: payload.group_name,
        client_id: payload.clientId,
        blocks: payload.blocks,
    })

    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    // Verify client belongs to this coach
    const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('id', parsed.data.client_id)
        .eq('coach_id', user.id)
        .maybeSingle()

    if (!client) return { error: 'Alumno no encontrado.' }

    const adminDb = await createRawAdminClient()

    let planId = payload.planId

    if (planId) {
        // Update existing plan title and group
        const { error: updateError } = await adminDb
            .from('workout_plans')
            .update({ 
                title: parsed.data.title,
                group_name: parsed.data.group_name
            })
            .eq('id', planId)
            .eq('coach_id', user.id)
            
        if (updateError) return { error: 'Error al actualizar el plan.' }

        // Remove old blocks to re-insert them fresh (simplest way to handle edits/reorders)
        await adminDb.from('workout_blocks').delete().eq('plan_id', planId)
    } else {
        // Insert new plan
        const { data: plan, error: planError } = await adminDb
            .from('workout_plans')
            .insert({
                client_id: parsed.data.client_id,
                coach_id: user.id,
                title: parsed.data.title,
                group_name: parsed.data.group_name,
                assigned_date: new Date().toISOString().split('T')[0],
            })
            .select('id')
            .maybeSingle()

        if (planError || !plan) {
            return { error: planError?.message ?? 'Error al crear el plan.' }
        }
        planId = plan.id
    }

    if (!planId) return { error: 'No se pudo obtener el ID del plan.' }

    // Insert blocks with order_index
    const blocksToInsert = parsed.data.blocks.map((block, index) => ({
        plan_id: planId,
        exercise_id: block.exercise_id,
        order_index: index,
        sets: block.sets,
        reps: block.reps,
        target_weight_kg: block.target_weight_kg ?? null,
        tempo: block.tempo ?? null,
        rir: block.rir ?? null,
        rest_time: block.rest_time ?? null,
        notes: block.notes ?? null,
    }))

    const { error: blocksError } = await adminDb
        .from('workout_blocks')
        .insert(blocksToInsert)

    if (blocksError) {
        // Rollback plan if it was a new plan
        if (!payload.planId) {
            await adminDb.from('workout_plans').delete().eq('id', planId)
        }
        return { error: blocksError.message }
    }

    revalidatePath(`/coach/clients/${parsed.data.client_id}`)
    return { planId }
}

export async function deletePlanAction(planId: string, clientId: string): Promise<{ error?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado.' }

    const adminDb = await createRawAdminClient()
    const { error } = await adminDb
        .from('workout_plans')
        .delete()
        .eq('id', planId)
        .eq('coach_id', user.id)

    if (error) return { error: error.message }

    revalidatePath(`/coach/clients/${clientId}`)
    return {}
}
