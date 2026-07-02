import Link from 'next/link'
import { ClipboardCheck, ChevronRight } from 'lucide-react'
import { getLastCheckIn } from '../../_data/dashboard.queries'
import { formatRelativeDate, getTodayInSantiago } from '@/lib/date-utils'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { CheckInBannerFrame } from './CheckInBannerFrame'
import { getClientBasePath } from '@/lib/client/base-path'

export async function CheckInBanner({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const base = await getClientBasePath(coachSlug)
    const last = await getLastCheckIn(userId)
    const { iso: todayIso } = getTodayInSantiago()

    if (!last?.created_at) {
        return (
            <Link
                href={`${base}/check-in`}
                className="flex items-center gap-3 rounded-card border border-subtle bg-surface-sunken p-3"
            >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-surface-card text-muted">
                    <ClipboardCheck className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-strong">Registra tu primer check-in</p>
                    <p className="text-xs text-muted">Peso y energía en segundos</p>
                </div>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted" />
            </Link>
        )
    }

    const lastDay = last.created_at.split('T')[0]
    const daysSince = differenceInCalendarDays(parseISO(`${todayIso}T12:00:00`), parseISO(`${lastDay}T12:00:00`))

    if (daysSince < 3) {
        return null
    }

    const variant = daysSince > 7 ? 'overdue' : 'warning'
    const message =
        variant === 'overdue'
            ? '¡Check-in pendiente!'
            : daysSince === 3
              ? 'Check-in próximo'
              : `Check-in próximo — hace ${daysSince} días`
    const dateText = `Último: ${formatRelativeDate(lastDay, todayIso)}`

    const overdue = variant === 'overdue'
    const box = overdue
        ? 'border-[var(--danger-200,var(--danger-100))] bg-[var(--danger-100)]'
        : 'border-ember-200 bg-ember-100'
    const accentText = overdue ? 'text-[var(--danger-700,var(--danger-600))]' : 'text-ember-700'
    const iconChip = overdue ? 'bg-[var(--danger-500)]' : 'bg-ember-500'

    return (
        <CheckInBannerFrame overdue={overdue} className={`rounded-card border ${box}`}>
            <Link href={`${base}/check-in`} className="flex items-center gap-3 p-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-white ${iconChip}`}>
                    <ClipboardCheck className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold ${accentText}`}>{message}</p>
                    <p className={`text-xs ${accentText} opacity-90`}>{dateText}</p>
                </div>
                <ChevronRight className={`h-[18px] w-[18px] shrink-0 ${accentText}`} />
            </Link>
        </CheckInBannerFrame>
    )
}
