import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

interface UnsubscribeBody {
  endpoint: string
}

function isValidBody(body: unknown): body is UnsubscribeBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return typeof b.endpoint === 'string' && b.endpoint.length > 0
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!isValidBody(body)) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { error } = await admin
    .from('push_subscriptions')
    .delete()
    .eq('client_id', user.id)
    .eq('endpoint', body.endpoint)

  if (error) {
    console.error('[push/unsubscribe]', error)
    return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
