'use server'

import { createClient } from '@/lib/supabase/server'
import { isAllowedAdminEmail, isAdminMfaEnforced } from '@/lib/admin/admin-gate'
import { redirect } from 'next/navigation'
import { LoginSchema } from '@eva/schemas'

export type AdminLoginState = {
    error?: string
    success?: boolean
}

// Mensaje UNICO para credenciales invalidas Y cuentas fuera de la allowlist: mensajes
// distintos permitian enumerar que cuentas existen desde la pantalla del panel (F4 08-05).
const GENERIC_ERROR = 'Credenciales incorrectas o cuenta sin acceso.'

/** Solo paths internos del panel — un ?next= externo o con esquema es open redirect. */
function safeNext(raw: FormDataEntryValue | null): string | null {
    if (typeof raw !== 'string' || !raw.startsWith('/admin')) return null
    if (raw.startsWith('//') || raw.includes('://')) return null
    return raw
}

export async function adminLoginAction(
    _prevState: AdminLoginState,
    formData: FormData
): Promise<AdminLoginState> {
    const raw = {
        email: formData.get('email') as string,
        password: formData.get('password') as string,
    }
    const next = safeNext(formData.get('next'))

    const parsed = LoginSchema.safeParse(raw)
    if (!parsed.success) {
        return { error: parsed.error.issues[0].message }
    }

    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
    })

    if (error) {
        // Nunca devolver error.message crudo de GoTrue (filtra detalles internos, F4).
        console.warn('[admin-login] signIn fallido:', error.message)
        return { error: GENERIC_ERROR }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: GENERIC_ERROR }

    if (!(await isAllowedAdminEmail(user.email))) {
        await supabase.auth.signOut()
        return { error: GENERIC_ERROR }
    }

    // MFA obligatoria: con factor verificado la sesion password-only (aal1) debe subir a aal2
    // en /admin/verify-mfa; sin factor, primero se enrola. El proxy re-verifica en cada request.
    if (isAdminMfaEnforced()) {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
        if (aal && aal.currentLevel !== 'aal2') {
            const mfaPath = aal.nextLevel === 'aal2' ? '/admin/verify-mfa' : '/admin/setup-mfa'
            redirect(next ? `${mfaPath}?next=${encodeURIComponent(next)}` : mfaPath)
        }
    }

    redirect(next ?? '/admin/dashboard')
}
