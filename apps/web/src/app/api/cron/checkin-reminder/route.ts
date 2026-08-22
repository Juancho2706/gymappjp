import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTodayInSantiago, daysSinceSantiagoInstant } from '@/lib/date-utils'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { sendPushToClient } from '@/lib/push'

/**
 * Recordatorio de check-in vencido (evento W1 `checkin_due`) — corre diario ~10:00 Chile.
 *
 * Regla (espejo del `CheckInBanner` del dashboard: aviso ≥3 días, vencido >7,
 * `daysSinceSantiagoInstant`): la push se manda EXACTAMENTE en dos hitos —
 * día 8 (recién vencido) y día 15 (refuerzo). Match por igualdad exacta en un cron
 * diario ⇒ cada hito dispara una sola vez sin necesitar tabla de deduplicación,
 * y el tope queda en máx. 2 pushes por ciclo de check-in. Alumnos SIN ningún
 * check-in histórico quedan fuera (el nudge de primer check-in es otro copy — W2).
 * Solo alumnos activos con algún destino de push (web o nativo).
 */

const DUE_DAY = 8
const REINFORCE_DAY = 15

function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${expected}`
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()
    const { iso: today } = getTodayInSantiago()

    const [{ data: subRows, error: subsError }, { data: tokenRows, error: tokensError }] =
      await Promise.all([
        supabase.from('push_subscriptions').select('client_id'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('push_tokens').select('user_id') as Promise<{
          data: { user_id: string }[] | null
          error: unknown
        }>,
      ])
    if (subsError || tokensError) {
      console.error('[cron/checkin-reminder] destinos query error:', subsError ?? tokensError)
      return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const candidateIds = [
      ...new Set([
        ...(subRows ?? []).map((r) => r.client_id),
        ...(tokenRows ?? []).map((r) => r.user_id),
      ]),
    ].filter(Boolean)

    if (candidateIds.length === 0) {
      return NextResponse.json({ ok: true, date: today, notified: 0 })
    }

    // Alumnos activos con marca del coach (para el white-label del payload).
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, org_id, team_id, is_active, coaches!inner ( slug, brand_name, logo_url, subscription_tier )')
      .in('id', candidateIds)
      .eq('is_active', true)
      // El alumno de ejemplo del onboarding (W8.1.8) nunca recibe push: su cuenta la abre el propio
      // coach desde «Vive tu app».
      .eq('is_demo', false)
    if (clientsError) {
      console.error('[cron/checkin-reminder] clients query error:', clientsError)
      return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }
    const clientRows = clients ?? []
    if (clientRows.length === 0) {
      return NextResponse.json({ ok: true, date: today, notified: 0 })
    }

    // Último check-in por alumno. `date` es timestamptz pero filas creadas por app/web pueden
    // traerlo NULL (solo escriben weight/energy/fotos) → fallback a created_at, igual que las
    // vistas. Volumen acotado: solo candidatos con push.
    const { data: checkins, error: checkinsError } = await supabase
      .from('check_ins')
      .select('client_id, date, created_at')
      .in('client_id', clientRows.map((c) => c.id))
      .order('created_at', { ascending: false })
    if (checkinsError) {
      console.error('[cron/checkin-reminder] check_ins query error:', checkinsError)
      return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const lastByClient = new Map<string, string>()
    for (const row of checkins ?? []) {
      if (!lastByClient.has(row.client_id)) {
        const instant = (row.date as string | null) ?? (row.created_at as string | null)
        if (instant) lastByClient.set(row.client_id, instant)
      }
    }

    let notified = 0
    for (const client of clientRows) {
      const lastInstant = lastByClient.get(client.id)
      if (!lastInstant) continue // sin historial: el nudge de primer check-in es W2

      const daysSince = daysSinceSantiagoInstant(lastInstant, today)
      if (daysSince !== DUE_DAY && daysSince !== REINFORCE_DAY) continue

      const coach = client.coaches as unknown as {
        slug: string
        brand_name: string | null
        logo_url: string | null
        subscription_tier: string | null
      } | null
      const coachSlug = coach?.slug ?? ''
      const brandName = coach?.brand_name ?? undefined
      const isStandalone = !client.org_id && !client.team_id
      const brandingOn =
        isStandalone && isBrandingAllowed((coach?.subscription_tier ?? 'free') as SubscriptionTier)
      const iconUrl = brandingOn && coach?.logo_url ? coach.logo_url : undefined

      await sendPushToClient(client.id, {
        event: 'checkin_due',
        title:
          daysSince === DUE_DAY ? 'Es hora de tu check-in 📸' : 'Tu check-in sigue pendiente 📸',
        body:
          daysSince === DUE_DAY
            ? 'Peso, energía y fotos — te toma 2 minutos'
            : `Ya pasaron ${daysSince} días desde el último. Tu coach quiere ver tu progreso`,
        url: `/c/${coachSlug}/check-in`,
        screen: '/alumno/(tabs)/check-in',
        ...(brandName ? { brandName } : {}),
        ...(iconUrl ? { iconUrl } : {}),
      })
      notified++
    }

    console.log(`[cron/checkin-reminder] date=${today} notified=${notified} candidates=${clientRows.length}`)
    return NextResponse.json({ ok: true, date: today, notified })
  } catch (e) {
    console.error('[cron/checkin-reminder]', e)
    return NextResponse.json({ ok: false, error: 'Cron failed' }, { status: 500 })
  }
}
