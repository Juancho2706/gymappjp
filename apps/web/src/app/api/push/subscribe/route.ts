import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

interface SubscribeBody {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

function isValidBody(body: unknown): body is SubscribeBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  if (typeof b.endpoint !== 'string' || !b.endpoint) return false
  if (!b.keys || typeof b.keys !== 'object') return false
  const keys = b.keys as Record<string, unknown>
  if (typeof keys.p256dh !== 'string' || !keys.p256dh) return false
  if (typeof keys.auth !== 'string' || !keys.auth) return false
  return true
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
    return NextResponse.json({ error: 'Invalid subscription body' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      client_id: user.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id,endpoint' }
  )

  if (error) {
    console.error('[push/subscribe]', error)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
