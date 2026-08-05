'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertAdmin, logAdminAction } from '@/lib/admin/admin-action-wrapper'

const AddGastoSchema = z.object({
    nombre:   z.string().min(1).max(200),
    cantidad: z.coerce.number().positive(),
    costo:    z.coerce.number().positive(),
    pagador:  z.string().min(1).max(100),
    // Fecha manual opcional (input date => 'YYYY-MM-DD'). Vacia = la DB pone now().
    fecha:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').or(z.literal('')).optional(),
})

export async function addGastoAction(_prev: unknown, formData: FormData) {
    const { adminClient, user } = await assertAdmin()

    const parsed = AddGastoSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
        return { error: parsed.error.issues.map(i => i.message).join(', ') }
    }

    const { fecha, ...gasto } = parsed.data

    // Mediodia UTC, no medianoche: `new Date('2026-08-05')` es 00:00Z y en Chile (UTC-4) se
    // renderiza como el dia 4. Anclar al mediodia absorbe el offset en ambos sentidos y no
    // depende de la TZ del servidor.
    const createdAt = fecha ? new Date(`${fecha}T12:00:00.000Z`).toISOString() : null

    const { data, error } = await adminClient
        .from('personal_gastos')
        .insert(createdAt ? { ...gasto, created_at: createdAt } : gasto)
        .select('id')
        .single()

    if (error) return { error: error.message }

    await logAdminAction(
        adminClient,
        'gasto.create',
        'personal_gastos',
        data?.id ?? null,
        { nombre: gasto.nombre, cantidad: gasto.cantidad, costo: gasto.costo },
        user.email,
    )

    revalidatePath('/admin/personal', 'page')
    return { success: true }
}

export async function deleteGastoAction(id: string) {
    const { adminClient, user } = await assertAdmin()

    // Se lee el nombre ANTES del delete: despues solo queda el uuid y el log no diria QUE se borro.
    const { data: gasto } = await adminClient
        .from('personal_gastos')
        .select('nombre')
        .eq('id', id)
        .maybeSingle()

    const { error } = await adminClient
        .from('personal_gastos')
        .delete()
        .eq('id', id)

    if (error) throw error

    await logAdminAction(
        adminClient,
        'gasto.delete',
        'personal_gastos',
        id,
        { id, nombre: gasto?.nombre ?? null },
        user.email,
    )

    revalidatePath('/admin/personal', 'page')
}
