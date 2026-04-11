// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * QA-027 (partial): anon vs service_role expectations.
 * Enable with SUPABASE_RLS_INTEGRATION=1 and valid Supabase env vars.
 */
const RUN =
    process.env.SUPABASE_RLS_INTEGRATION === '1' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!RUN)('QA-027 client modes (anon vs service_role)', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    it('anon without JWT: clients select returns empty (RLS)', async () => {
        const anon = createClient<Database>(url, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data, error } = await anon.from('clients').select('id').limit(1)
        expect(error).toBeNull()
        expect((data ?? []).length).toBe(0)
    })

    it('service_role: clients select succeeds and returns an array (RLS bypass)', async () => {
        const admin = createClient<Database>(url, serviceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data, error } = await admin.from('clients').select('id').limit(3)
        expect(error).toBeNull()
        expect(Array.isArray(data)).toBe(true)
    })
})
