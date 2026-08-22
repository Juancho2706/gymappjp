import { redirect } from 'next/navigation'
import { Shield } from 'lucide-react'
import { isAllowedAdminEmail } from '@/lib/admin/admin-gate'
import { safeNext } from '@/lib/auth/safe-next'
import { AdminLoginForm } from './AdminLoginForm'
import { getAdminLoginUser } from './_data/login.queries'

export const metadata = {
    title: 'Acceso | CEO | EVA',
    robots: { index: false, follow: false },
}

interface Props {
    searchParams: Promise<{ next?: string }>
}

export default async function AdminLoginPage({ searchParams }: Props) {
    const [user, sp] = await Promise.all([getAdminLoginUser(), searchParams])
    const next = safeNext(sp.next, '/admin')

    // Already logged in and is admin → el proxy decide si falta MFA.
    if (user?.email && (await isAllowedAdminEmail(user.email))) {
        redirect(next ?? '/admin/dashboard')
    }

    return (
        <div className="dark flex min-h-[100dvh] items-center justify-center bg-surface-app px-4" style={{ colorScheme: 'dark' }}>
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-sport-500/10">
                        <Shield className="h-5 w-5 text-[var(--sport-500)]" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-strong">Panel CEO</h1>
                    <p className="mt-2 text-sm text-muted">
                        Acceso restringido a administradores de EVA.
                    </p>
                </div>
                <AdminLoginForm next={next ?? undefined} />
            </div>
        </div>
    )
}
