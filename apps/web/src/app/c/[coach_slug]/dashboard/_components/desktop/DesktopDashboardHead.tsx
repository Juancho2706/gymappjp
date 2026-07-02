import Link from 'next/link'
import { Flame, UserRound } from 'lucide-react'
import { getActiveProgram, getClientProfile, getDashboardStreak } from '../../_data/dashboard.queries'
import { formatLongDateSantiago, getTodayInSantiago, timeGreetingSantiago } from '@/lib/date-utils'
import { programWeekIndex1Based } from '@/lib/workout/programWeekVariant'
import { getClientBasePath } from '@/lib/client/base-path'

/**
 * Cabecera desktop del alumno — `.dt-dash-head` de `DesktopAlumnoDashboard`:
 * eyebrow (programa · semana) + saludo grande a la izquierda, chip de racha a la derecha.
 * En desktop el kit DEMOTE la racha a un chip compacto (el ribbon prominente es el tratamiento
 * móvil). El acceso a cuenta/apariencia es un atajo a Mi perfil (`/perfil`) — hogar único de
 * ajustes; el desktop no tiene entrada a /perfil en el sidebar.
 *
 * Datos reales: `getClientProfile` (nombre), `getDashboardStreak` (RPC racha), `getActiveProgram`
 * (nombre + semana). Todo deduplicado por `React.cache` con el resto del dashboard.
 */
export async function DesktopDashboardHead({
    userId,
    coachSlug,
}: {
    userId: string
    coachSlug: string
}) {
    const base = await getClientBasePath(coachSlug)
    const [{ client }, streak, program] = await Promise.all([
        getClientProfile(userId),
        getDashboardStreak(userId),
        getActiveProgram(userId),
    ])

    const firstName = client?.full_name?.split(' ')[0] ?? 'Atleta'
    const greeting = `${timeGreetingSantiago()}, ${firstName}`
    const { date: userLocalDate } = getTodayInSantiago()
    const weekIdx = program ? programWeekIndex1Based(program, userLocalDate) : null
    const eyebrow = program ? `${program.name}${weekIdx ? ` · Semana ${weekIdx}` : ''}` : formatLongDateSantiago()

    return (
        <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
                <div className="text-[12px] font-bold capitalize tracking-[0.03em] text-muted">{eyebrow}</div>
                <h1 className="mt-[3px] font-display text-[30px] font-black tracking-[-0.03em] text-strong">{greeting}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-3">
                {streak > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-pill bg-ember-100 px-3.5 py-2 font-bold text-ember-700">
                        <Flame className="h-[18px] w-[18px]" />
                        <span className="font-display text-[18px] leading-none tabular-nums">{streak}</span>
                        <span className="text-xs">días</span>
                    </span>
                ) : null}
                <Link
                    href={`${base}/perfil`}
                    prefetch={false}
                    aria-label="Mi perfil"
                    title="Mi perfil"
                    className="flex h-11 w-11 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong"
                >
                    <UserRound className="h-5 w-5" />
                </Link>
            </div>
        </div>
    )
}
