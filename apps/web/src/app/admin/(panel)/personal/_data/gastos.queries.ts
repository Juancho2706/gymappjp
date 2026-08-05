import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export type Gasto = {
    id: string
    nombre: string
    cantidad: number
    costo: number
    pagador: string
    /** Puede venir de la fecha manual del formulario, no solo del default now(). */
    created_at: string
    /** cantidad × costo — la plata REAL que salio por esta fila. */
    subtotal: number
}

export async function getGastos(): Promise<Gasto[]> {
    const client = createServiceRoleClient()
    const { data, error } = await client
        .from('personal_gastos')
        .select('id, nombre, cantidad, costo, pagador, created_at')
        .order('created_at', { ascending: false })

    if (error) throw error

    // El subtotal se calcula UNA vez aca: los totales y los KPI sumaban `costo` a secas, asi que
    // "Hosting x3 $10.000" aportaba $10.000 en vez de $30.000.
    return (data ?? []).map((g) => ({
        ...g,
        subtotal: g.cantidad * g.costo,
    }))
}
