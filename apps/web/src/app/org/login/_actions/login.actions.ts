'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { OrgLoginSchema } from '@eva/schemas'
import { jitter } from '@/lib/auth/timing'
import { readFailCount, incrementFailCount, clearFailCount, CAPTCHA_THRESHOLD } from '@/lib/auth/fail-counter'
import { verifyTurnstile } from '@/lib/auth/turnstile'

export type OrgLoginState = {
    error?: string
}

const GENERIC_ERROR = 'No pudimos iniciar sesión.'

export async function loginOrgAction(
    _prevState: OrgLoginState,
    formData: FormData,
): Promise<OrgLoginState> {
    const raw = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        captchaToken: (formData.get('cf-turnstile-response') as string) || undefined,
    }

    const parsed = OrgLoginSchema.safeParse(raw)
    if (!parsed.success) {
        await jitter()
        return { error: GENERIC_ERROR }
    }

    const failCount = await readFailCount('org')

    if (failCount >= CAPTCHA_THRESHOLD) {
        const hdrs = await headers()
        const ip = hdrs.get('x-forwarded-for') ?? hdrs.get('x-real-ip') ?? null
        const captchaOk = await verifyTurnstile(parsed.data.captchaToken, ip, { failCount })
        if (!captchaOk) {
            await jitter()
            await incrementFailCount('org')
            return { error: GENERIC_ERROR }
        }
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
    })

    if (error) {
        await jitter()
        await incrementFailCount('org')
        return { error: GENERIC_ERROR }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        await jitter()
        return { error: GENERIC_ERROR }
    }

    const { data: membership } = await supabase
        .from('organization_members')
        .select('role, org_id')
        .eq('user_id', user.id)
        .in('role', ['org_owner', 'org_admin'])
        .eq('status', 'active')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle()

    if (!membership?.org_id) {
        await supabase.auth.signOut()
        await jitter()
        return { error: GENERIC_ERROR }
    }

    const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', membership.org_id)
        .is('deleted_at', null)
        .maybeSingle()

    if (!org?.slug) {
        await supabase.auth.signOut()
        await jitter()
        return { error: GENERIC_ERROR }
    }

    await clearFailCount('org')

    redirect(`/org/${org.slug}`)
}
