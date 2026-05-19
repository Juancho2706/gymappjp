import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
    const startedAt = Date.now()

    try {
        const supabase = createServiceRoleClient()
        const { error } = await supabase
            .from('coaches')
            .select('id', { count: 'exact', head: true })
            .limit(1)

        if (error) {
            return NextResponse.json(
                {
                    status: 'degraded',
                    db: 'error',
                    error: error.message,
                    latencyMs: Date.now() - startedAt,
                    timestamp: new Date().toISOString(),
                },
                { status: 503 }
            )
        }

        return NextResponse.json(
            {
                status: 'ok',
                db: 'ok',
                latencyMs: Date.now() - startedAt,
                timestamp: new Date().toISOString(),
            },
            {
                status: 200,
                headers: { 'Cache-Control': 'no-store, max-age=0' },
            }
        )
    } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        return NextResponse.json(
            {
                status: 'down',
                db: 'unreachable',
                error: message,
                latencyMs: Date.now() - startedAt,
                timestamp: new Date().toISOString(),
            },
            { status: 503 }
        )
    }
}
