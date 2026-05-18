import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export type Gasto = {
    id: string
    nombre: string
    cantidad: number
    costo: number
    pagador: string
    created_at: string
}

export async function getGastos(): Promise<Gasto[]> {
    const client = createServiceRoleClient()
    const { data, error } = await client
        .from('personal_gastos')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) throw error
    return (data ?? []) as Gasto[]
}
