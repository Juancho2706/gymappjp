import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTodayInSantiago, nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { sendPushToClient } from '@/lib/push'

/**
 * Recordatorio diario de comidas (evento W1 `meal_reminder`).
 *
 * 2026-07-29: migrado del envío web-push inline a `sendPushToClient` (web + Expo en una llamada)
 * — antes SOLO llegaba a la PWA y la app nativa quedaba muda pese a registrar tokens. Los
 * candidatos ahora son la unión de suscripciones web (`push_subscriptions`) y tokens nativos
 * (`push_tokens`); el resto de la lógica (plan activo, meal-aware, white-label Pro+ standalone,
 * skip si ya registró hoy) es la misma. El kill-switch por evento y la limpieza de suscripciones
 * vencidas viven en el sender.
 */

function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${expected}`
}

type CandidateRow = {
  id: string
  org_id: string | null
  team_id: string | null
  coaches: {
    slug: string
    brand_name: string | null
    logo_url: string | null
    subscription_tier: string | null
  } | null
  nutrition_plans: {
    id: string
    is_active: boolean
    nutrition_meals: { name: string | null; day_of_week: number | null }[]
  }[]
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()
    const { iso: today } = getTodayInSantiago()

    // Destinos posibles: web (push_subscriptions, por client_id) ∪ nativo (push_tokens, por
    // user_id — incluye coaches, que el inner-join a `clients` de abajo excluye solo).
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
      console.error('[cron/nutrition-reminder] destinos query error:', subsError ?? tokensError)
      return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const candidateIds = [
      ...new Set([
        ...(subRows ?? []).map((r) => r.client_id),
        ...(tokenRows ?? []).map((r) => r.user_id),
      ]),
    ].filter(Boolean)

    if (candidateIds.length === 0) {
      return NextResponse.json({ ok: true, date: today, notified: 0, skipped: 0 })
    }

    // Solo alumnos con plan de nutrición ACTIVO (mismo criterio de siempre).
    const { data: candidates, error: candidatesError } = await supabase
      .from('clients')
      .select(
        `
        id,
        org_id,
        team_id,
        coaches!inner ( slug, brand_name, logo_url, subscription_tier ),
        nutrition_plans!inner ( id, is_active, nutrition_meals ( name, day_of_week ) )
      `
      )
      .in('id', candidateIds)
      .eq('nutrition_plans.is_active', true)

    if (candidatesError) {
      console.error('[cron/nutrition-reminder] candidates query error:', candidatesError)
      return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const rows = (candidates ?? []) as unknown as CandidateRow[]
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, date: today, notified: 0, skipped: 0 })
    }

    // Alumnos que YA registraron hoy → no molestar.
    const { data: logsToday, error: logsError } = await supabase
      .from('daily_nutrition_logs')
      .select('client_id')
      .eq('log_date', today)
      .in('client_id', rows.map((c) => c.id))

    if (logsError) {
      console.error('[cron/nutrition-reminder] logs query error:', logsError)
      return NextResponse.json({ ok: false, error: 'Logs query failed' }, { status: 500 })
    }

    const loggedClientIds = new Set((logsToday ?? []).map((l) => l.client_id))
    const toNotify = rows.filter((c) => !loggedClientIds.has(c.id))
    const skipped = rows.length - toNotify.length

    let notified = 0
    for (const client of toNotify) {
      const coach = client.coaches
      const coachSlug = coach?.slug ?? ''

      // White-label (W2): nombre+logo del coach solo si alumno STANDALONE (no pool team ni org)
      // con tier Pro+ (misma regla que la app). Si no → marca EVA (fallback del SW/handler).
      const brandName = coach?.brand_name ?? undefined
      const isStandalone = !client.org_id && !client.team_id
      const brandingOn =
        isStandalone && isBrandingAllowed((coach?.subscription_tier ?? 'starter') as SubscriptionTier)
      const iconUrl = brandingOn && coach?.logo_url ? coach.logo_url : undefined

      // Recordatorio meal-aware (C3): lista las comidas del plan que aplican HOY (day_of_week
      // null = diario; 1=Lun…7=Dom). Sin comidas hoy → mensaje genérico, nunca se suprime.
      const activePlan =
        (client.nutrition_plans ?? []).find((p) => p.is_active) ?? client.nutrition_plans?.[0]
      const mealsToday = [
        ...new Set(
          (activePlan?.nutrition_meals ?? [])
            .filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, today))
            .map((m) => m.name?.trim())
            .filter((n): n is string => !!n)
        ),
      ]
      const body =
        mealsToday.length > 0
          ? `Hoy: ${mealsToday.slice(0, 4).join(' · ')}${mealsToday.length > 4 ? ` +${mealsToday.length - 4}` : ''}. Toca para registrar 🥗`
          : `Recuerda registrar tus comidas de hoy${brandName ? ` en ${brandName}` : ''}`

      await sendPushToClient(client.id, {
        event: 'meal_reminder',
        title: '¿Ya registraste tus comidas? 🥗',
        body,
        url: `/c/${coachSlug}/nutrition`,
        screen: '/alumno/(tabs)/nutricion',
        ...(brandName ? { brandName } : {}),
        ...(iconUrl ? { iconUrl } : {}),
      })
      notified++
    }

    console.log(`[cron/nutrition-reminder] date=${today} notified=${notified} skipped=${skipped} candidates=${rows.length}`)
    return NextResponse.json({ ok: true, date: today, notified, skipped })
  } catch (e) {
    console.error('[cron/nutrition-reminder]', e)
    return NextResponse.json({ ok: false, error: 'Cron failed' }, { status: 500 })
  }
}
