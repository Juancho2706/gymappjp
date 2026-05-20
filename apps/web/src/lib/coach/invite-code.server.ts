import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { generateInviteCode } from './invite-code'

export async function generateUniqueInviteCode(admin: SupabaseClient<Database>): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
        const code = generateInviteCode()
        const { data } = await admin.from('coaches').select('id').eq('invite_code', code).maybeSingle()
        if (!data) return code
    }
    throw new Error('No se pudo generar un codigo unico')
}
