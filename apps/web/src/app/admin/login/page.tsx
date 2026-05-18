import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/admin-gate'
import { AdminLoginForm } from './AdminLoginForm'

export default async function AdminLoginPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Already logged in and is admin → redirect to dashboard
    if (user?.email && isAdminEmail(user.email)) {
        redirect('/admin/dashboard')
    }

    return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 px-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-white">Panel CEO</h1>
                    <p className="mt-2 text-sm text-neutral-400">
                        Acceso restringido a administradores de EVA.
                    </p>
                </div>
                <AdminLoginForm />
            </div>
        </div>
    )
}
