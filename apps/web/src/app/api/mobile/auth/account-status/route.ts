import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { isBlockedClientRow, verifyMobileBearer } from '@/lib/mobile-auth'

function bearerToken(request: NextRequest): string | null {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

/**
 * Minimal account state for the native suspended screen. It deliberately uses service role only
 * after binding the subject to the bearer, and never returns training/nutrition/profile data.
 * A blocked student may call this endpoint so the app can explain the state before its session
 * and caches are cleared; all data endpoints still return CLIENT_BLOCKED/403.
 */
export async function GET(request: NextRequest) {
  const token = bearerToken(request)
  if (!token) return NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 })

  // Verificación local del JWT: un access token aún vigente debe poder leer este payload
  // mínimo incluso después de `ban_duration`, para que RN alcance a explicar el bloqueo y
  // limpiar sesión/cachés. Las rutas de datos siguen negadas por RLS/CLIENT_BLOCKED.
  const auth = await verifyMobileBearer(token)
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 })
  }

  const admin = createServiceRoleClient()

  const { data: client } = await admin
    .from('clients')
    .select('coach_id, team_id, is_archived, is_active, force_password_change')
    .eq('id', auth.userId)
    .maybeSingle()

  const blocked = isBlockedClientRow(client)
  let brandName = 'tu coach'
  const whatsapp: string | null = null
  let isTeam = false

  if (client?.team_id) {
    const { data: team } = await admin.from('teams').select('name').eq('id', client.team_id).maybeSingle()
    isTeam = true
    brandName = team?.name || 'tu equipo'
  } else if (client?.coach_id) {
    const { data: coach } = await admin
      .from('coaches')
      .select('full_name, brand_name')
      .eq('id', client.coach_id)
      .maybeSingle()
    brandName = coach?.brand_name || coach?.full_name || 'tu coach'
  }

  return NextResponse.json({
    access: blocked ? 'blocked' : 'active',
    reason: client?.is_archived === true ? 'archived' : client?.is_active === false ? 'paused' : null,
    isTeam,
    brandName,
    whatsapp,
    forcePasswordChange: client?.force_password_change === true,
  }, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Authorization' },
  })
}
