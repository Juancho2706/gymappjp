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

/** Shared brand header — same lockup for the sign-up form and the disabled state. */
function BrandHeader({
    brandName,
    color,
    logoUrl,
    welcomeMessage,
}: {
    brandName: string
    color: string
    logoUrl: string | null
    welcomeMessage: string | null
}) {
    return (
        <div className="flex flex-col items-center gap-3 mb-8">
            {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- public page, arbitrary coach logo domains
                <img src={logoUrl} alt={brandName} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
                <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl"
                    style={{ backgroundColor: color }}
                >
                    {brandName.charAt(0).toUpperCase()}
                </div>
            )}
            <div className="text-center">
                <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{brandName}</h1>
                {welcomeMessage && <p className="mt-1 text-sm text-zinc-500">{welcomeMessage}</p>}
            </div>
        </div>
    )
}

export default async function JoinPage({ params }: Props) {
    const { invite_code } = await params
    const admin = createServiceRoleClient()

    // B-7: resolve scope from the code — enterprise codes show ORG branding,
    // standalone codes show coach branding.
    const invite = await resolveInvite(admin, invite_code)
    if (!invite) notFound()

    const brandName = invite.brandName
    const color = invite.primaryColor ?? '#10B981'
    const logoUrl = invite.logoUrl

    // C-KILL (2026-07-04): standalone (coaches.invite_code) self-signup is OFF. The coach
    // adds students manually from their panel, so we render a branded, cared-for "managed
    // signup" state instead of a form that would fail at submit. Team/org keep the form.
    if (invite.scope === 'standalone') {
        return (
            <div className="min-h-dvh flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4 py-12">
                <div className="w-full max-w-sm">
                    <BrandHeader
                        brandName={brandName}
                        color={color}
                        logoUrl={logoUrl}
                        welcomeMessage={invite.welcomeMessage}
                    />

                    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
                        <div
                            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
                            style={{ backgroundColor: `${color}1A`, color }}
                            aria-hidden="true"
                        >
                            <svg
                                width="26"
                                height="26"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>

                        <h2 className="text-center text-base font-semibold text-zinc-900 dark:text-zinc-100">
                            Tu coach te suma a mano
                        </h2>
                        <p className="mt-2 text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                            El registro directo está desactivado. Pedile a{' '}
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">{brandName}</span> que te
                            agregue desde su panel y vas a recibir tus datos para entrar.
                        </p>

                        <a
                            href={invite.loginHref}
                            style={{ backgroundColor: color }}
                            className="mt-6 flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        >
                            Ya tengo cuenta
                        </a>
                    </div>

                    <p className="mt-4 text-center text-xs text-zinc-400">
                        ¿Problemas para entrar? Escribile directo a tu coach.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4 py-12">
            <div className="w-full max-w-sm">
                <BrandHeader
                    brandName={brandName}
                    color={color}
                    logoUrl={logoUrl}
                    welcomeMessage={invite.welcomeMessage}
                />

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
