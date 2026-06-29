import { ClientSettingsModal } from '@/components/client/ClientSettingsModal'
import { getClientProfile } from '../_data/dashboard.queries'
import { formatLongDateSantiago, getTodayInSantiago, timeGreetingSantiago } from '@/lib/date-utils'
import { ClientGreeting } from './header/ClientGreeting'

interface DashboardHeaderProps {
    userId: string
    coachSlug: string
    initialUseBrandColors: boolean
    brandName: string | null | undefined
    welcomeMessage?: string | null
}

export async function DashboardHeader({ userId, coachSlug, initialUseBrandColors, brandName, welcomeMessage }: DashboardHeaderProps) {
    const { client } = await getClientProfile(userId)
    const firstName = client?.full_name?.split(' ')[0] ?? 'Atleta'
    const greet = timeGreetingSantiago()
    const dateLabel = formatLongDateSantiago()
    const { iso } = getTodayInSantiago()

    const greeting = `${greet}, ${firstName}`

    return (
        <header className="sticky left-0 right-0 top-0 z-40 border-b border-subtle bg-surface-app/95 pt-safe backdrop-blur-xl lg:static lg:z-auto lg:border-none lg:bg-transparent lg:pt-0 lg:backdrop-blur-none">
            <div className="flex h-14 items-center justify-between gap-3 px-4 lg:px-0">
                <div className="min-w-0 flex-1">
                    {brandName ? (
                        <p className="truncate text-[10px] font-bold uppercase tracking-widest text-subtle">{brandName}</p>
                    ) : null}
                    <ClientGreeting greeting={greeting} dateLabel={dateLabel} key={iso} />
                    {welcomeMessage ? (
                        <p className="mt-0.5 truncate text-[11px] text-muted">{welcomeMessage}</p>
                    ) : null}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                    <ClientSettingsModal coachSlug={coachSlug} initialUseBrandColors={initialUseBrandColors} />
                </div>
            </div>
        </header>
    )
}
