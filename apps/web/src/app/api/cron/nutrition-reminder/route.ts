import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTodayInSantiago, nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'

function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${expected}`
}

function setupVapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const email = process.env.VAPID_EMAIL

  if (!publicKey || !privateKey || !email) {
    throw new Error('Missing VAPID environment variables')
  }

  webpush.setVapidDetails(email, publicKey, privateKey)
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    setupVapid()
  } catch (e) {
    console.error('[cron/nutrition-reminder] VAPID setup failed:', e)
    return NextResponse.json({ ok: false, error: 'VAPID not configured' }, { status: 500 })
  }

  try {
    const supabase = createServiceRoleClient()
    const { iso: today } = getTodayInSantiago()

    // Get clients who have an active nutrition plan AND a push subscription
    const { data: candidates, error: candidatesError } = await supabase
      .from('push_subscriptions')
      .select(
        `
        client_id,
        endpoint,
        p256dh,
        auth,
        clients!inner (
          coach_id,
          coaches!inner ( slug ),
          nutrition_plans!inner ( id, is_active, nutrition_meals ( name, day_of_week ) )
        )
      `
      )
      .eq('clients.nutrition_plans.is_active', true)

    if (candidatesError) {
      console.error('[cron/nutrition-reminder] candidates query error:', candidatesError)
      return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: 0 })
    }

    // Get client IDs that already logged meals today
    const clientIds = candidates.map((c) => c.client_id)
    const { data: logsToday, error: logsError } = await supabase
      .from('daily_nutrition_logs')
      .select('client_id')
      .eq('log_date', today)
      .in('client_id', clientIds)

    if (logsError) {
      console.error('[cron/nutrition-reminder] logs query error:', logsError)
      return NextResponse.json({ ok: false, error: 'Logs query failed' }, { status: 500 })
    }

    const loggedClientIds = new Set((logsToday ?? []).map((l) => l.client_id))

    // Filter to only clients who have NOT logged today
    const toNotify = candidates.filter((c) => !loggedClientIds.has(c.client_id))

    let sent = 0
    let failed = 0
    const skipped = candidates.length - toNotify.length

    for (const sub of toNotify) {
      const clientData = sub.clients as unknown as {
        coach_id: string
        coaches: { slug: string }
        nutrition_plans: {
          id: string
          is_active: boolean
          nutrition_meals: { name: string | null; day_of_week: number | null }[]
        }[]
      }

      const coachSlug = clientData?.coaches?.slug ?? ''
      const notificationUrl = `/c/${coachSlug}/nutrition`

      // Recordatorio meal-aware (C3, versión liviana): lista las comidas del plan que aplican HOY
      // (day_of_week null = diario; 1=Lun…7=Dom). Mismo cron diario, misma query (una relación
      // anidada más) → cero IO/cron extra. Si no hay comidas hoy (p.ej. día sin plan), cae al
      // mensaje genérico — nunca suprime el recordatorio.
      const activePlan =
        (clientData.nutrition_plans ?? []).find((p) => p.is_active) ?? clientData.nutrition_plans?.[0]
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
          : 'Recuerda registrar tus comidas de hoy en EVA'

      const payload = JSON.stringify({
        title: '¿Ya registraste tus comidas? 🥗',
        body,
        url: notificationUrl,
      })

      const pushSubscription: webpush.PushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      }

      try {
        await webpush.sendNotification(pushSubscription, payload)
        sent++
      } catch (err) {
        console.error(`[cron/nutrition-reminder] Failed to send to client ${sub.client_id}:`, err)
        // If subscription is expired/invalid (410 Gone), remove it
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 410 || statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('client_id', sub.client_id)
            .eq('endpoint', sub.endpoint)
        }
        failed++
      }
    }

    console.log(`[cron/nutrition-reminder] date=${today} sent=${sent} failed=${failed} skipped=${skipped}`)
    return NextResponse.json({ ok: true, date: today, sent, failed, skipped })
  } catch (e) {
    console.error('[cron/nutrition-reminder]', e)
    return NextResponse.json({ ok: false, error: 'Cron failed' }, { status: 500 })
  }
}
