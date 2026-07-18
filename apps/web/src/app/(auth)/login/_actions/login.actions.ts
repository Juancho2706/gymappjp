'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { CoachLoginSchema } from '@eva/schemas'
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect.server'
import { jitter } from '@/lib/auth/timing'
import { readFailCount, incrementFailCount, clearFailCount, CAPTCHA_THRESHOLD } from '@/lib/auth/fail-counter'
import { verifyTurnstile } from '@/lib/auth/turnstile'

export type LoginState = {
    error?: string
    success?: boolean
}

const GENERIC_ERROR = 'No pudimos verificar tus credenciales. Revisa email y contraseña.'

export async function loginAction(
    _prevState: LoginState,
    formData: FormData
): Promise<LoginState> {
    const raw = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
        captchaToken: (formData.get('cf-turnstile-response') as string) || undefined,
    }

    const parsed = CoachLoginSchema.safeParse(raw)
    if (!parsed.success) {
        await jitter()
        return { error: GENERIC_ERROR }
    }

    const failCount = await readFailCount('coach')

    if (failCount >= CAPTCHA_THRESHOLD) {
        const hdrs = await headers()
        const ip = hdrs.get('x-forwarded-for') ?? hdrs.get('x-real-ip') ?? null
        const captchaOk = await verifyTurnstile(parsed.data.captchaToken, ip, { failCount })
        if (!captchaOk) {
            await jitter()
            await incrementFailCount('coach')
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
        await incrementFailCount('coach')
        return { error: GENERIC_ERROR }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        await jitter()
        return { error: GENERIC_ERROR }
    }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

    if (!coach) {
        await supabase.auth.signOut()
        await jitter()
        return { error: GENERIC_ERROR }
    }

    await clearFailCount('coach')

    const redirectPath = await resolvePostLoginRedirect(supabase, user.id)

    revalidatePath(redirectPath)
    redirect(redirectPath)
}
