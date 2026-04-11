import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Skeleton } from '@/components/ui/skeleton'
import { GlassCard } from '@/components/ui/glass-card'
import { DashboardContent } from './_components/DashboardContent'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function CoachDashboardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    return (
        <Suspense fallback={<DashboardSkeleton />}>
            <DashboardContent userId={user.id} />
        </Suspense>
    )
}

function DashboardSkeleton() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <Skeleton className="h-12 w-64 md:h-14 md:w-80" />
                    <Skeleton className="h-4 w-48 md:w-96" />
                </div>
                <Skeleton className="h-10 w-32" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {[1, 2, 3, 4].map((i) => (
                    <GlassCard key={i} className="h-32 md:h-40 p-4 md:p-6 space-y-4">
                        <div className="flex justify-between">
                            <Skeleton className="h-10 w-10 md:h-12 md:w-12 rounded-xl" />
                            <Skeleton className="h-6 w-6 rounded-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-6 w-16 md:h-8 md:w-20" />
                            <Skeleton className="h-3 w-24 md:w-28" />
                        </div>
                    </GlassCard>
                ))}
            </div>
            <GlassCard className="h-[400px] w-full p-6">
                <Skeleton className="h-full w-full opacity-20" />
            </GlassCard>
        </div>
    )
}
