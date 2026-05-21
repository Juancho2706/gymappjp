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

export type DashboardClientRow = Pick<ClientRow, 'id' | 'full_name' | 'coach_id'> & {
    coaches: {
        brand_name: string
        primary_color: string
        logo_url: string | null
        welcome_message: string | null
        welcome_modal_enabled: boolean
        welcome_modal_content: string | null
        welcome_modal_type: string
        welcome_modal_version: number
    } | {
        brand_name: string
        primary_color: string
        logo_url: string | null
        welcome_message: string | null
        welcome_modal_enabled: boolean
        welcome_modal_content: string | null
        welcome_modal_type: string
        welcome_modal_version: number
    }[] | null
}

export async function findClientById(db: DB, clientId: string): Promise<ClientRow | null> {
    const { data } = await db
        .from('clients')
        .select('id, full_name, email, phone, coach_id, org_id, is_active, created_at')
        .eq('id', clientId)
        .maybeSingle()
    return data as ClientRow | null
}

export async function findDashboardClientById(db: DB, clientId: string): Promise<DashboardClientRow | null> {
    const { data } = await db
        .from('clients')
        .select('id, full_name, coach_id, coaches ( brand_name, primary_color, logo_url, welcome_message, welcome_modal_enabled, welcome_modal_content, welcome_modal_type, welcome_modal_version )')
        .eq('id', clientId)
        .maybeSingle()
    return data as DashboardClientRow | null
}

export async function findClientsByCoach(db: DB, coachId: string): Promise<ClientRow[]> {
    const { data } = await db
        .from('clients')
        .select('id, full_name, email, phone, coach_id, org_id, is_active, created_at')
        .eq('coach_id', coachId)
        .order('full_name', { ascending: true })
    return (data ?? []) as ClientRow[]
}
