import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admin/admin-gate'
import { AdminDarkWrapper } from './AdminDarkWrapper'
import { AdminSidebar } from './AdminSidebar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: { default: 'Panel CEO', template: '%s | CEO | EVA' },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user?.email || !isAdminEmail(user.email)) {
        redirect('/admin/login')
    }

    return (
        <AdminDarkWrapper>
            <div className="admin-shell flex min-h-[100dvh] flex-col bg-[--admin-bg-base] text-[--admin-text-1] md:flex-row">

                {/* Sidebar (desktop) + mobile bottom bar — both rendered by AdminSidebar */}
                <AdminSidebar userEmail={user.email} />

                {/* Main content */}
                <main className="flex-1 overflow-y-auto pb-[calc(56px+env(safe-area-inset-bottom))] md:pb-0">
                    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
                        {children}
                    </div>
                </main>
            </div>
        </AdminDarkWrapper>
    )
}
