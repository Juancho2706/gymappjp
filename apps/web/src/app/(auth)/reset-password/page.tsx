import { redirect } from 'next/navigation'
import { ResetPasswordForm } from './_components/ResetPasswordForm'

interface Props {
    /**
     * `token_hash` llega cuando la plantilla de Supabase usa `{{ .TokenHash }}`:
     * `/auth/callback` lo reenvía tal cual «para que el destino lo canjee»
     * (`app/auth/callback/route.ts:45-48`).
     */
    searchParams: Promise<{
        token_hash?: string | string[]
        coach_slug?: string | string[]
        team_slug?: string | string[]
    }>
}

/** Un query repetido llega como arreglo; se toma el primer valor, igual que `searchParams.get()`. */
function first(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
}

/**
 * `/reset-password` — el formulario necesita una SESIÓN de recuperación viva para que
 * `updateUser({ password })` tenga a quién actualizar.
 *
 * Con `?token_hash=` nadie había canjeado nada todavía: se pintaba el form y el guardado moría con
 * «el link puede haber expirado». La máquina de canje ya existe y es `/auth/confirm` (`verifyOtp` +
 * rama `type=recovery` que devuelve acá con la sesión abierta), así que este server component solo
 * hace el desvío; el token NO se canjea desde el cliente.
 */
export default async function ResetPasswordPage({ searchParams }: Props) {
    const sp = await searchParams
    const tokenHash = first(sp.token_hash)
    const coachSlug = first(sp.coach_slug)
    const teamSlug = first(sp.team_slug)

    if (tokenHash) {
        // El `next` conserva los slugs para que la vuelta del canje siga siendo white-label; mismo
        // orden que arma el correo (`forgot-password.actions.ts`): team antes que coach.
        const resetParams = new URLSearchParams()
        if (teamSlug) resetParams.set('team_slug', teamSlug)
        if (coachSlug) resetParams.set('coach_slug', coachSlug)
        const query = resetParams.toString()
        const next = query ? `/reset-password?${query}` : '/reset-password'

        const confirmParams = new URLSearchParams({
            token_hash: tokenHash,
            // Fijo: esta ruta solo existe para el camino de recuperación.
            type: 'recovery',
            next,
        })
        redirect(`/auth/confirm?${confirmParams.toString()}`)
    }

    return (
        <div className="w-full max-w-md mx-auto">
            <ResetPasswordForm coachSlug={coachSlug} teamSlug={teamSlug} />
        </div>
    )
}
