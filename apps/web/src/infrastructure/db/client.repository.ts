import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

export type ClientRow = {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    coach_id: string | null
    org_id: string | null
    is_active: boolean | null
    created_at: string | null
}

export async function findClientById(db: DB, clientId: string): Promise<ClientRow | null> {
    const { data } = await db
        .from('clients')
        .select('id, full_name, email, phone, coach_id, org_id, is_active, created_at')
        .eq('id', clientId)
        .maybeSingle()
    return data as ClientRow | null
}

export async function findClientsByCoach(db: DB, coachId: string): Promise<ClientRow[]> {
    const { data } = await db
        .from('clients')
        .select('id, full_name, email, phone, coach_id, org_id, is_active, created_at')
        .eq('coach_id', coachId)
        .order('full_name', { ascending: true })
    return (data ?? []) as ClientRow[]
}
