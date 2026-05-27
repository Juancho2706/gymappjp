'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getOrgAdminContext, writeOrgAuditEvent } from '@/services/org/org.service'

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

const TemplateIdSchema = z.uuid()

async function resolveAdminContext(orgSlug: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'No autenticado' as const }
    return getOrgAdminContext(supabase, user.id, orgSlug)
}

export async function createOrgNutritionTemplateAction(orgSlug: string, payload: unknown) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const parsed = CreateOrgNutritionTemplateSchema.safeParse(payload)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos invalidos' }

    const admin = createServiceRoleClient()
    const { data: template, error } = await admin.from('org_nutrition_templates').insert({
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
    }).select('id').single()

    if (error) return { error: error.message }
    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'org_nutrition_template.created',
        targetType: 'org_nutrition_template',
        targetId: template.id,
        metadata: {
            name: parsed.data.name,
            goal_type: parsed.data.goal_type || null,
            meal_count: parsed.data.meal_names.length,
        },
    })
    revalidatePath(`/org/${orgSlug}/nutrition`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}

export async function deleteOrgNutritionTemplateAction(orgSlug: string, id: string) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const parsedId = TemplateIdSchema.safeParse(id)
    if (!parsedId.success) return { error: 'Template invalido' }

    const admin = createServiceRoleClient()
    const { error } = await admin
        .from('org_nutrition_templates')
        .delete()
        .eq('id', parsedId.data)
        .eq('org_id', ctx.org.id)

    if (error) return { error: error.message }
    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'org_nutrition_template.deleted',
        targetType: 'org_nutrition_template',
        targetId: parsedId.data,
        metadata: {},
    })
    revalidatePath(`/org/${orgSlug}/nutrition`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true }
}
