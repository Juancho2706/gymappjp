import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getTodayInSantiago, nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { sendPushToClient } from '@/lib/push'
import {
  buildV2MealNamesByVariant,
  pickEffectiveV2VersionByClient,
  pickV2DayVariantByVersion,
  type NutritionV2MealSlotRow,
  type NutritionV2PlanRow,
  type NutritionV2VariantRow,
  type NutritionV2VersionRow,
} from './v2-candidates'

/**
 * Recordatorio diario de comidas (evento W1 `meal_reminder`).
 *
 * 2026-07-29: migrado del envío web-push inline a `sendPushToClient` (web + Expo en una llamada)
 * — antes SOLO llegaba a la PWA y la app nativa quedaba muda pese a registrar tokens. Los
 * candidatos ahora son la unión de suscripciones web (`push_subscriptions`) y tokens nativos
 * (`push_tokens`); el resto de la lógica (plan activo, meal-aware, white-label standalone,
 * skip si ya registró hoy) es la misma. El kill-switch por evento y la limpieza de suscripciones
 * vencidas viven en el sender.
 *
 * 2026-08-06 (T1.1): el filtro miraba SOLO tablas V1 (`nutrition_plans` + `daily_nutrition_logs`),
 * asi que un alumno cuyo coach publica unicamente en Nutricion V2 no recibia NADA. Ahora los
 * candidatos son la UNION de V1 y V2, deduplicada por alumno:
 *   · V1  → plan `nutrition_plans.is_active`, skip por `daily_nutrition_logs`, link a `/nutrition`
 *   · V2  → version vigente hoy (mismo selector que el snapshot, ver `v2-candidates.ts`),
 *           skip por `nutrition_intake_entries`, link a `/nutrition-v2`
 * Ante un alumno con ambos gana V2 (es el estandar del producto para todos los planes).
 * Sigue siendo UN cron, mismo schedule y sin una sola query por alumno: la parte V2 son 4
 * selects planos batcheados (planes → versiones → variantes → franjas). PROHIBIDO meter aca
 * `get_nutrition_today_v2` u otra RPC por alumno.
 */

function isAuthorized(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${expected}`
}

type CoachBrand = {
  slug: string
  brand_name: string | null
  logo_url: string | null
  subscription_tier: string | null
}

type CandidateRow = {
  id: string
  org_id: string | null
  team_id: string | null
  coaches: CoachBrand | null
  nutrition_plans: {
    id: string
    is_active: boolean
    nutrition_meals: { name: string | null; day_of_week: number | null }[]
  }[]
}

type ClientBrandRow = {
  id: string
  org_id: string | null
  team_id: string | null
  coaches: CoachBrand | null
}

/** Destinatario ya resuelto: de que superficie es y que comidas nombra el push. */
type Recipient = {
  clientId: string
  orgId: string | null
  teamId: string | null
  coach: CoachBrand | null
  /** Gobierna el deep-link y la tabla contra la que se comprueba "ya registro hoy". */
  isV2: boolean
  mealsToday: string[]
}

/**
 * Cliente acotado para las tablas V2, que todavia NO estan en `database.types.ts` (mismo
 * patron que `fetchSubstitutionsByItem` en la ruta del alumno). Cero `any`: solo los
 * operadores que se usan aca. Retirar el cast cuando se regeneren los tipos por CLI.
 */
type V2Query<T> = PromiseLike<{ data: T[] | null; error: { message?: string } | null }> & {
  eq(column: string, value: string): V2Query<T>
  neq(column: string, value: string): V2Query<T>
  in(column: string, values: readonly string[]): V2Query<T>
  lte(column: string, value: string): V2Query<T>
  or(filter: string): V2Query<T>
}
type V2ReadClient = {
  from(table: string): { select<T>(columns: string): V2Query<T> }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createServiceRoleClient()
    const v2 = supabase as unknown as V2ReadClient
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

    // ── V1: alumnos con plan de nutrición ACTIVO (mismo criterio de siempre). ──
    // ── V2: raíces de plan activas de los mismos candidatos (select plano). ──
    const [
      { data: candidates, error: candidatesError },
      { data: v2Plans, error: v2PlansError },
    ] = await Promise.all([
      supabase
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
        .eq('nutrition_plans.is_active', true),
      v2
        .from('nutrition_plans_v2')
        .select<NutritionV2PlanRow>('id, client_id')
        .in('client_id', candidateIds)
        .eq('lifecycle_status', 'active'),
    ])

    if (candidatesError || v2PlansError) {
      console.error('[cron/nutrition-reminder] candidates query error:', candidatesError ?? v2PlansError)
      return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const rows = (candidates ?? []) as unknown as CandidateRow[]
    const planRows = v2Plans ?? []

    // ── Cadena V2: versión vigente hoy → variante del día → franjas. Todo batcheado. ──
    let v2VersionByClient = new Map<string, string>()
    let v2VariantByVersion = new Map<string, string>()
    let v2MealsByVariant = new Map<string, string[]>()

    if (planRows.length > 0) {
      const { data: versionRows, error: versionsError } = await v2
        .from('nutrition_plan_versions_v2')
        .select<NutritionV2VersionRow>('id, plan_id, version_number, effective_from, published_at')
        .in('plan_id', planRows.map((plan) => plan.id))
        .in('status', ['published', 'superseded'])
        .lte('effective_from', today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)

      if (versionsError) {
        console.error('[cron/nutrition-reminder] v2 versions query error:', versionsError)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
      }

      v2VersionByClient = pickEffectiveV2VersionByClient(planRows, versionRows ?? [])
      const versionIds = [...new Set(v2VersionByClient.values())]

      if (versionIds.length > 0) {
        const { data: variantRows, error: variantsError } = await v2
          .from('nutrition_day_variants_v2')
          .select<NutritionV2VariantRow>('id, version_id, day_of_week, is_default, order_index, created_at')
          .in('version_id', versionIds)

        if (variantsError) {
          console.error('[cron/nutrition-reminder] v2 variants query error:', variantsError)
          return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
        }

        v2VariantByVersion = pickV2DayVariantByVersion(variantRows ?? [], today)
        const variantIds = [...new Set(v2VariantByVersion.values())]

        if (variantIds.length > 0) {
          const { data: slotRows, error: slotsError } = await v2
            .from('nutrition_meal_slots_v2')
            .select<NutritionV2MealSlotRow>('day_variant_id, name, order_index')
            .in('day_variant_id', variantIds)

          // Las franjas SOLO decoran el copy: si fallan, el push sale con el texto genérico.
          if (slotsError) {
            console.error('[cron/nutrition-reminder] v2 slots query error:', slotsError)
          } else {
            v2MealsByVariant = buildV2MealNamesByVariant(slotRows ?? [])
          }
        }
      }
    }

    // Marca/tenencia de los alumnos que SOLO existen por V2 (la query V1 no los devolvió).
    const v1ById = new Map(rows.map((row) => [row.id, row]))
    const v2OnlyIds = [...v2VersionByClient.keys()].filter((clientId) => !v1ById.has(clientId))
    let v2OnlyRows: ClientBrandRow[] = []
    if (v2OnlyIds.length > 0) {
      const { data: brandRows, error: brandError } = await supabase
        .from('clients')
        .select('id, org_id, team_id, coaches!inner ( slug, brand_name, logo_url, subscription_tier )')
        .in('id', v2OnlyIds)

      if (brandError) {
        console.error('[cron/nutrition-reminder] v2 clients query error:', brandError)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
      }
      v2OnlyRows = (brandRows ?? []) as unknown as ClientBrandRow[]
    }

    // ── Unión deduplicada por alumno. V2 gana sobre V1 cuando el alumno tiene ambos. ──
    const recipients = new Map<string, Recipient>()

    for (const client of rows) {
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
      recipients.set(client.id, {
        clientId: client.id,
        orgId: client.org_id,
        teamId: client.team_id,
        coach: client.coaches,
        isV2: false,
        mealsToday,
      })
    }

    const v2BrandById = new Map<string, ClientBrandRow>(v2OnlyRows.map((row) => [row.id, row]))
    for (const [clientId, versionId] of v2VersionByClient) {
      const base = v1ById.get(clientId) ?? v2BrandById.get(clientId)
      // Sin fila en `clients` con coach (inner join) no hay marca ni slug: mismo criterio que V1.
      if (!base) continue
      const variantId = v2VariantByVersion.get(versionId)
      recipients.set(clientId, {
        clientId,
        orgId: base.org_id,
        teamId: base.team_id,
        coach: base.coaches,
        isV2: true,
        mealsToday: (variantId ? v2MealsByVariant.get(variantId) : undefined) ?? [],
      })
    }

    if (recipients.size === 0) {
      return NextResponse.json({ ok: true, date: today, notified: 0, skipped: 0 })
    }

    // ── Alumnos que YA registraron hoy → no molestar. Cada superficie con su tabla. ──
    const all = [...recipients.values()]
    const v1Ids = all.filter((r) => !r.isV2).map((r) => r.clientId)
    const v2Ids = all.filter((r) => r.isV2).map((r) => r.clientId)

    const [
      { data: logsToday, error: logsError },
      { data: intakeToday, error: intakeError },
    ] = await Promise.all([
      v1Ids.length > 0
        ? supabase.from('daily_nutrition_logs').select('client_id').eq('log_date', today).in('client_id', v1Ids)
        : Promise.resolve({ data: [] as { client_id: string }[], error: null }),
      // V2: un retiro (`entry_status = 'voided'`) NO cuenta como registro — si el alumno
      // deshizo todo lo del dia, el recordatorio vuelve a aplicar. `entry_status` es
      // `not null default 'active'` (20260714190000), asi que el filtro no pierde filas viejas.
      v2Ids.length > 0
        ? v2
            .from('nutrition_intake_entries')
            .select<{ client_id: string }>('client_id')
            .eq('log_date', today)
            .neq('entry_status', 'voided')
            .in('client_id', v2Ids)
        : Promise.resolve({ data: [] as { client_id: string }[], error: null }),
    ])

    if (logsError || intakeError) {
      console.error('[cron/nutrition-reminder] logs query error:', logsError ?? intakeError)
      return NextResponse.json({ ok: false, error: 'Logs query failed' }, { status: 500 })
    }

    const loggedClientIds = new Set([
      ...(logsToday ?? []).map((l) => l.client_id),
      ...(intakeToday ?? []).map((l) => l.client_id),
    ])
    const toNotify = all.filter((r) => !loggedClientIds.has(r.clientId))
    const skipped = all.length - toNotify.length

    let notified = 0
    for (const recipient of toNotify) {
      const coach = recipient.coach
      const coachSlug = coach?.slug ?? ''

      // White-label (W2): nombre+logo del coach solo si alumno STANDALONE (no pool team ni org).
      // Desde Pricing v3 aplica a TODOS los planes; `isBrandingAllowed` queda de red fail-closed
      // (tier inválido/stale). Si no → marca EVA (fallback del SW/handler).
      const brandName = coach?.brand_name ?? undefined
      const isStandalone = !recipient.orgId && !recipient.teamId
      const brandingOn =
        isStandalone && isBrandingAllowed((coach?.subscription_tier ?? 'free') as SubscriptionTier)
      const iconUrl = brandingOn && coach?.logo_url ? coach.logo_url : undefined

      const mealsToday = recipient.mealsToday
      const body =
        mealsToday.length > 0
          ? `Hoy: ${mealsToday.slice(0, 4).join(' · ')}${mealsToday.length > 4 ? ` +${mealsToday.length - 4}` : ''}. Toca para registrar 🥗`
          : `Recuerda registrar tus comidas de hoy${brandName ? ` en ${brandName}` : ''}`

      await sendPushToClient(recipient.clientId, {
        event: 'meal_reminder',
        title: '¿Ya registraste tus comidas? 🥗',
        body,
        // El alumno V1 (hoy: enterprise) aterriza en su propia superficie — mandarlo a
        // `/nutrition-v2` le mostraria "todavia no hay plan" o un redirect de vuelta.
        url: recipient.isV2 ? `/c/${coachSlug}/nutrition-v2` : `/c/${coachSlug}/nutrition`,
        // RN: el tab `nutricion` ES la experiencia V2 (`(tabs)/nutricion.tsx` reexporta
        // `nutrition-v2/index`). Es ademas la unica ruta que existe en TODOS los binarios
        // instalados, y este payload lo emite el servidor para todos ellos a la vez.
        screen: '/alumno/(tabs)/nutricion',
        ...(brandName ? { brandName } : {}),
        ...(iconUrl ? { iconUrl } : {}),
      })
      notified++
    }

    console.log(
      `[cron/nutrition-reminder] date=${today} notified=${notified} skipped=${skipped} candidates=${all.length} v2=${v2Ids.length}`
    )
    return NextResponse.json({ ok: true, date: today, notified, skipped })
  } catch (e) {
    console.error('[cron/nutrition-reminder]', e)
    return NextResponse.json({ ok: false, error: 'Cron failed' }, { status: 500 })
  }
}
