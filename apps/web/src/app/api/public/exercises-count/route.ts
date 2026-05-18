import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export async function GET() {
    try {
        const supabase = createServiceRoleClient()
        const { count, error } = await supabase
            .from('exercises')
            .select('id', { count: 'exact', head: true })
            .is('coach_id', null)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ count: count ?? 0 }, {
            headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo obtener el total.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
