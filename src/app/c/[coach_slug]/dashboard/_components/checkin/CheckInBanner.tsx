import Link from 'next/link'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { getLastCheckIn } from '../../_data/dashboard.queries'
import { formatRelativeDate, getTodayInSantiago } from '@/lib/date-utils'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { CheckInBannerFrame } from './CheckInBannerFrame'

export async function CheckInBanner({ userId, coachSlug }: { userId: string; coachSlug: string }) {
    const last = await getLastCheckIn(userId)
    const { iso: todayIso } = getTodayInSantiago()

    if (!last?.created_at) {
        return (
            <div className="flex items-center gap-3 rounded-xl border-l-4 border-muted-foreground/30 bg-muted p-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Registra tu primer check-in</p>
                    <p className="text-xs text-muted-foreground">Peso y energía en segundos</p>
                </div>
                <Link
                    href={`/c/${coachSlug}/check-in`}
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-[color:var(--theme-primary)]"
                >
                    Ir
                </Link>
            </div>
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

    const box =
        variant === 'overdue'
            ? 'border-l-red-500 bg-red-50 dark:border-l-red-400 dark:bg-red-950/30'
            : 'border-l-amber-500 bg-amber-50 dark:border-l-amber-400 dark:bg-amber-950/30'

    return (
        <CheckInBannerFrame overdue={variant === 'overdue'} className={`flex items-center gap-3 rounded-xl border-l-4 p-3 ${box}`}>
            {variant === 'overdue' ? (
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            ) : (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{message}</p>
                <p className="text-xs text-muted-foreground">{dateText}</p>
            </div>
            <Link
                href={`/c/${coachSlug}/check-in`}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-background/80 px-4 text-xs font-semibold shadow-sm"
            >
                Check-in
            </Link>
        </CheckInBannerFrame>
    )
}
