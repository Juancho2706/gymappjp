import { unstable_noStore as noStore } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

export interface CronStatus {
    action: string
    label: string
    lastRunAt: string | null
    lastResult: string | null
}

export interface SistemaData {
    dbConnected: boolean
    totalCoaches: number
    totalClients: number
    activeCoaches: number
    betaCoaches: number
    expiredCoaches: number
    overdueCoaches: number
    recentAuditCount: number
    lastAuditAt: string | null
    orphanCoaches: number
    migrationsCount: number
    cronStatuses: CronStatus[]
}

export async function getSistemaData(): Promise<SistemaData> {
    noStore()
    const admin = createServiceRoleClient()

    const CRON_ACTIONS = [
        { action: 'cron.trial_expiry_ran',     label: 'Trial expiry' },
        { action: 'cron.nutrition_cycles_ran', label: 'Nutrition cycles' },
        { action: 'cron.nutrition_reminder_ran', label: 'Nutrition reminder' },
    ]

    try {
        const [
            coachesRes,
            clientsRes,
            activeRes,
            betaRes,
            expiredRes,
            overdueRes,
            auditRecentRes,
            auditLastRes,
            orphanRes,
            ...cronRes
        ] = await Promise.all([
            admin.from('coaches').select('*', { count: 'exact', head: true }),
            admin.from('clients').select('*', { count: 'exact', head: true }),
            admin.from('coaches').select('*', { count: 'exact', head: true })
                .in('subscription_status', ['active', 'trialing']),
            admin.from('coaches').select('*', { count: 'exact', head: true })
                .eq('payment_provider', 'beta'),
            admin.from('coaches').select('*', { count: 'exact', head: true })
                .eq('subscription_status', 'expired'),
            admin.from('coaches').select('*', { count: 'exact', head: true })
                .in('subscription_status', ['past_due', 'pending_payment']),
            admin.from('admin_audit_logs').select('*', { count: 'exact', head: true })
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
            admin.from('admin_audit_logs').select('created_at').order('created_at', { ascending: false }).limit(1),
            // Coaches with current_period_end expired but still active (legacy bug)
            admin.from('coaches').select('*', { count: 'exact', head: true })
                .eq('subscription_status', 'active')
                .eq('payment_provider', 'beta')
                .lt('current_period_end', new Date().toISOString()),
            ...CRON_ACTIONS.map(({ action }) =>
                admin.from('admin_audit_logs')
                    .select('created_at, target_id')
                    .eq('action', action)
                    .order('created_at', { ascending: false })
                    .limit(1)
            ),
        ])

        const cronStatuses: CronStatus[] = CRON_ACTIONS.map(({ action, label }, i) => {
            const row = (cronRes[i]?.data as any[])?.[0]
            return {
                action,
                label,
                lastRunAt: row?.created_at ?? null,
                lastResult: row?.target_id ?? null,
            }
        })

        return {
            dbConnected: true,
            totalCoaches: coachesRes.count ?? 0,
            totalClients: clientsRes.count ?? 0,
            activeCoaches: activeRes.count ?? 0,
            betaCoaches: betaRes.count ?? 0,
            expiredCoaches: expiredRes.count ?? 0,
            overdueCoaches: overdueRes.count ?? 0,
            recentAuditCount: auditRecentRes.count ?? 0,
            lastAuditAt: (auditLastRes.data as any[])?.[0]?.created_at ?? null,
            orphanCoaches: orphanRes.count ?? 0,
            migrationsCount: 0,
            cronStatuses,
        }
    } catch {
        return {
            dbConnected: false,
            totalCoaches: 0,
            totalClients: 0,
            activeCoaches: 0,
            betaCoaches: 0,
            expiredCoaches: 0,
            overdueCoaches: 0,
            recentAuditCount: 0,
            lastAuditAt: null,
            orphanCoaches: 0,
            migrationsCount: 0,
            cronStatuses: [],
        }
    }
}
