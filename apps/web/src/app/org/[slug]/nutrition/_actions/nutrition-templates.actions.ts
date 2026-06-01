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

/**
 * Creates an org-level nutrition plan template in nutrition_plan_templates
 * (coach_id = null, org_id = orgId). Coaches open it in their builder to add meals.
 * Requires P2.5-D migration: nutrition_plan_templates.coach_id nullable.
 */
export async function createOrgNutritionPlanTemplateAction(orgSlug: string, formData: FormData) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const name = String(formData.get('name') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    const goalType = String(formData.get('goal_type') ?? '').trim()
    const calories = formData.get('daily_calories') ? Number(formData.get('daily_calories')) : null
    const protein = formData.get('protein_g') ? Number(formData.get('protein_g')) : null
    const carbs = formData.get('carbs_g') ? Number(formData.get('carbs_g')) : null
    const fats = formData.get('fats_g') ? Number(formData.get('fats_g')) : null

    if (!name || name.length < 2) return { error: 'El nombre debe tener al menos 2 caracteres' }
    if (name.length > 120) return { error: 'Nombre demasiado largo' }

    const admin = createServiceRoleClient()
    const { data: template, error } = await admin
        .from('nutrition_plan_templates')
        .insert({
            org_id: ctx.org.id,
            coach_id: null,
            name,
            description: description || null,
            goal_type: goalType || null,
            daily_calories: calories,
            protein_g: protein,
            carbs_g: carbs,
            fats_g: fats,
        })
        .select('id')
        .single()

    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'nutrition_template.created',
        targetType: 'nutrition_plan_template',
        targetId: template.id,
        metadata: { name, goal_type: goalType || null, daily_calories: calories },
    })

    revalidatePath(`/org/${orgSlug}/nutrition`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, templateId: template.id }
}

/**
 * Assigns an org nutrition plan template to all assigned org clients
 * (or a subset). Creates nutrition_plans using each client's coach_id.
 * Only works for clients who already have a coach assigned.
 * Templates from nutrition_plan_templates (coach_id = null, org_id = orgId).
 */
export async function assignOrgNutritionPlanTemplateToClientsAction(
    orgSlug: string,
    templateId: string,
) {
    const ctx = await resolveAdminContext(orgSlug)
    if ('error' in ctx) return { error: ctx.error }

    const parsedId = TemplateIdSchema.safeParse(templateId)
    if (!parsedId.success) return { error: 'Template invalido' }

    const admin = createServiceRoleClient()

    // Fetch template (must be org-owned: coach_id = null)
    const { data: template } = await admin
        .from('nutrition_plan_templates')
        .select('id, name, daily_calories, protein_g, carbs_g, fats_g, description')
        .eq('id', parsedId.data)
        .eq('org_id', ctx.org.id)
        .is('coach_id', null)
        .maybeSingle()
    if (!template) return { error: 'Template org no encontrado' }

    // Fetch all assigned org clients
    const { data: clients } = await admin
        .from('clients')
        .select('id, coach_id, full_name')
        .eq('org_id', ctx.org.id)
        .not('coach_id', 'is', null)
        .eq('is_active', true)
    if (!clients || clients.length === 0) return { error: 'No hay alumnos con coach asignado' }

    // Deactivate existing active plans for these clients
    const clientIds = clients.map(c => c.id)
    await admin
        .from('nutrition_plans')
        .update({ is_active: false })
        .in('client_id', clientIds)
        .eq('org_id', ctx.org.id)
        .eq('is_active', true)

    // Create new plans from template macros
    const plans = clients.map(client => ({
        client_id: client.id,
        coach_id: client.coach_id!,
        org_id: ctx.org.id,
        template_id: template.id,
        name: template.name,
        daily_calories: template.daily_calories,
        protein_g: template.protein_g,
        carbs_g: template.carbs_g,
        fats_g: template.fats_g,
        instructions: template.description,
        is_active: true,
        is_custom: false,
    }))

    const { error } = await admin.from('nutrition_plans').insert(plans)
    if (error) return { error: error.message }

    await writeOrgAuditEvent(admin, {
        orgId: ctx.org.id,
        actorId: ctx.user.id,
        action: 'nutrition_template.assigned',
        targetType: 'nutrition_plan_template',
        targetId: template.id,
        metadata: { name: template.name, clients_assigned: plans.length },
    })

    revalidatePath(`/org/${orgSlug}/nutrition`)
    revalidatePath(`/org/${orgSlug}/audit`)
    return { success: true, assigned: plans.length }
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
