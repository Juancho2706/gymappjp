import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { JoinForm } from './_components/JoinForm'
import { resolveInvite } from './_lib/resolve-invite'

interface Props {
    params: Promise<{ invite_code: string }>
}

export async function generateMetadata({ params }: Props) {
    const { invite_code } = await params
    const admin = createServiceRoleClient()
    const invite = await resolveInvite(admin, invite_code)
    return { title: invite ? `Únete a ${invite.brandName}` : 'Únete' }
}

export default async function JoinPage({ params }: Props) {
    const { invite_code } = await params
    const admin = createServiceRoleClient()

    // B-7: resolve scope from the code — enterprise codes show ORG branding,
    // standalone codes show coach branding.
    const invite = await resolveInvite(admin, invite_code)
    if (!invite) notFound()

    const coach = {
        brand_name: invite.brandName,
        primary_color: invite.primaryColor,
        logo_url: invite.logoUrl,
        welcome_message: invite.welcomeMessage,
    }

    const color = coach.primary_color ?? '#10B981'

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4 py-12">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center gap-3 mb-8">
                    {coach.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={coach.logo_url} alt={coach.brand_name} className="w-16 h-16 rounded-2xl object-cover" />
                    ) : (
                        <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl"
                            style={{ backgroundColor: color }}
                        >
                            {coach.brand_name.charAt(0).toUpperCase()}
                        </div>
                    )}
                    <div className="text-center">
                        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{coach.brand_name}</h1>
                        {coach.welcome_message && (
                            <p className="mt-1 text-sm text-zinc-500">{coach.welcome_message}</p>
                        )}
                    </div>
                </div>

                <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-5">Crear tu cuenta</h2>
                    <JoinForm inviteCode={invite_code} primaryColor={color} />
                </div>

                <p className="mt-4 text-center text-xs text-zinc-400">
                    ¿Ya tenés cuenta?{' '}
                    <a href={invite.loginHref} className="underline hover:text-zinc-600">
                        Inicia sesión
                    </a>
                </p>
            </div>
        </div>
    )
}
