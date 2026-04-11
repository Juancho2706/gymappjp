// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * QA-021–QA-025: cross-tenant checks with real JWTs.
 *
 * Required when SUPABASE_RLS_INTEGRATION=1:
 * - RLS_TEST_CLIENT_A_EMAIL, RLS_TEST_CLIENT_A_PASSWORD (client user A)
 * - RLS_TEST_PEER_CLIENT_ID: uuid of another client under the same coach (alumno B)
 * - RLS_TEST_OTHER_COACH_CLIENT_ID (optional): client uuid belonging to another coach (QA-022)
 */
const RUN =
    process.env.SUPABASE_RLS_INTEGRATION === '1' &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.RLS_TEST_CLIENT_A_EMAIL &&
    process.env.RLS_TEST_CLIENT_A_PASSWORD &&
    process.env.RLS_TEST_PEER_CLIENT_ID

describe.skipIf(!RUN)('QA-021–QA-025 RLS tenant isolation (JWT)', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    it('QA-021: client A cannot read check_ins rows for peer client B', async () => {
        const client = createClient<Database>(url, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        })
        const { error: signErr } = await client.auth.signInWithPassword({
            email: process.env.RLS_TEST_CLIENT_A_EMAIL!,
            password: process.env.RLS_TEST_CLIENT_A_PASSWORD!,
        })
        expect(signErr).toBeNull()

        const peerId = process.env.RLS_TEST_PEER_CLIENT_ID!
        const { data, error } = await client.from('check_ins').select('id').eq('client_id', peerId)

        expect(error).toBeNull()
        expect((data ?? []).length).toBe(0)
    })

    it.skipIf(!process.env.RLS_TEST_OTHER_COACH_CLIENT_ID)(
        'QA-022: client A cannot read clients row for another coach',
        async () => {
            const otherCoachClient = process.env.RLS_TEST_OTHER_COACH_CLIENT_ID!

            const client = createClient<Database>(url, anonKey, {
                auth: { persistSession: false, autoRefreshToken: false },
            })
            await client.auth.signInWithPassword({
                email: process.env.RLS_TEST_CLIENT_A_EMAIL!,
                password: process.env.RLS_TEST_CLIENT_A_PASSWORD!,
            })

            const { data, error } = await client.from('clients').select('id').eq('id', otherCoachClient)
            expect(error).toBeNull()
            expect((data ?? []).length).toBe(0)
        }
    )
})
