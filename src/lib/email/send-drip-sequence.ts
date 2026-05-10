import { sendTransactionalEmail, addResendAudienceContact } from './send-email'
import { buildDripTemplates } from './drip-templates'

type FreeDripInput = {
    email: string
    coachName: string
    brandName: string
}

/**
 * Schedules the full D+3 / D+7 / D+14 drip sequence for a new free coach.
 * Uses Resend's `scheduled_at` — no cron job needed.
 * Also adds the coach to the Resend Audience for broadcast visibility.
 * All calls are best-effort: a failure here never blocks registration.
 */
export async function scheduleFreeCoachDripSequence(input: FreeDripInput): Promise<void> {
    const audienceId = process.env.RESEND_FREE_COACH_AUDIENCE_ID
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    const now = Date.now()
    const day = 24 * 60 * 60 * 1000

    const templates = buildDripTemplates({
        coachName: input.coachName,
        brandName: input.brandName,
        baseUrl,
    })

    // Skip day1 — already sent as welcome email in register/actions.ts
    const scheduled: Array<{ subject: string; html: string; scheduledAt: string }> = [
        { ...templateByKey(templates, 'day3_clients'),  scheduledAt: new Date(now + 3  * day).toISOString() },
        { ...templateByKey(templates, 'day7_nutrition'), scheduledAt: new Date(now + 7  * day).toISOString() },
        { ...templateByKey(templates, 'day14_upgrade'), scheduledAt: new Date(now + 14 * day).toISOString() },
    ]

    // Schedule all drip emails in parallel, fire-and-forget
    const emailPromises = scheduled.map(({ subject, html, scheduledAt }) =>
        sendTransactionalEmail({ to: input.email, subject, html, scheduledAt }).catch(() => null)
    )

    // Add to Resend Audience (for dashboard visibility + manual broadcasts)
    const audiencePromise = audienceId
        ? addResendAudienceContact({
              audienceId,
              email: input.email,
              firstName: input.coachName.split(' ')[0],
              lastName: input.coachName.split(' ').slice(1).join(' ') || undefined,
              data: {
                  brand_name: input.brandName,
                  plan: 'free',
                  registered_at: new Date(now).toISOString(),
              },
          })
        : Promise.resolve()

    await Promise.allSettled([...emailPromises, audiencePromise])
}

function templateByKey(
    templates: ReturnType<typeof buildDripTemplates>,
    key: string
): { subject: string; html: string } {
    const t = templates.find((t) => t.key === key)
    return { subject: t?.subject ?? '', html: t?.html ?? '' }
}
