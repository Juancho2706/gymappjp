'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

const MealNameSchema = z.object({
    name: z.string().min(1).max(80),
    order_index: z.number().int(),
    description: z.string().max(200).optional().or(z.literal('')),
})

const CreateOrgNutritionTemplateSchema = z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional().or(z.literal('')),
    goal_type: z.string().max(40).optional().or(z.literal('')),
    daily_calories: z.coerce.number().int().positive().optional(),
    protein_g: z.coerce.number().int().nonnegative().optional(),
    carbs_g: z.coerce.number().int().nonnegative().optional(),
    fats_g: z.coerce.number().int().nonnegative().optional(),
    instructions: z.string().max(2000).optional().or(z.literal('')),
    meal_names: z.array(MealNameSchema).default([]),
})

async function resolveAdminContext(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const }

    const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
    if (!org) return { error: 'Organización no encontrada' as const }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!membership) return { error: 'Sin permisos de administrador' as const }

    return { user, org, supabase }
}

export async function createOrgNutritionTemplateAction(orgSlug: string, payload: unknown) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const parsed = CreateOrgNutritionTemplateSchema.safeParse(payload)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

    const admin = createServiceRoleClient()
    const { error } = await admin.from('org_nutrition_templates').insert({
        org_id: ctx.org.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        goal_type: parsed.data.goal_type || null,
        daily_calories: parsed.data.daily_calories ?? null,
        protein_g: parsed.data.protein_g ?? null,
        carbs_g: parsed.data.carbs_g ?? null,
        fats_g: parsed.data.fats_g ?? null,
        instructions: parsed.data.instructions || null,
        meal_names: parsed.data.meal_names,
        created_by: ctx.user.id,
    })

    if (error) return { error: error.message }
    revalidatePath(`/org/${orgSlug}/nutrition`)
    return { success: true }
}

export async function deleteOrgNutritionTemplateAction(orgSlug: string, id: string) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const admin = createServiceRoleClient()
    const { error } = await admin
        .from('org_nutrition_templates')
        .delete()
        .eq('id', id)
        .eq('org_id', ctx.org.id)

    if (error) return { error: error.message }
    revalidatePath(`/org/${orgSlug}/nutrition`)
    return { success: true }
}
