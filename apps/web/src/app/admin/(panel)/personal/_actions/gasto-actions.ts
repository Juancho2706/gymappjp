'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { assertAdmin } from '@/lib/admin/admin-action-wrapper'

const AddGastoSchema = z.object({
    nombre:   z.string().min(1).max(200),
    cantidad: z.coerce.number().positive(),
    costo:    z.coerce.number().positive(),
    pagador:  z.string().min(1).max(100),
})

export async function addGastoAction(_prev: unknown, formData: FormData) {
    const { adminClient } = await assertAdmin()

    const parsed = AddGastoSchema.safeParse(Object.fromEntries(formData))
    if (!parsed.success) {
        return { error: parsed.error.issues.map(i => i.message).join(', ') }
    }

    const { error } = await adminClient
        .from('personal_gastos')
        .insert(parsed.data)

    if (error) return { error: error.message }

    revalidatePath('/admin/personal', 'page')
    return { success: true }
}

export async function deleteGastoAction(id: string) {
    const { adminClient } = await assertAdmin()

    const { error } = await adminClient
        .from('personal_gastos')
        .delete()
        .eq('id', id)

    if (error) throw error
    revalidatePath('/admin/personal', 'page')
}
