import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { ChevronLeft, Dumbbell, ChevronDown, Calendar } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getWorkoutHistoryDayCounts } from '@/app/c/[coach_slug]/dashboard/_data/dashboard.queries'
import { WorkoutHistoryList } from './_components/WorkoutHistoryList'
import { getWorkoutHistoryUser } from './_data/workout-history.queries'
import { getClientBasePath } from '@/lib/client/base-path'

export const metadata: Metadata = { title: 'Historial de entrenos' }

const DEFAULT_DAYS = 90
const EXTENDED_DAYS = 180

interface Props {
    params: Promise<{ coach_slug: string }>
    searchParams: Promise<{ range?: string }>
}

export default async function ClientWorkoutHistoryPage({ params, searchParams }: Props) {
    const { coach_slug } = await params
    const { range } = await searchParams
    const base = await getClientBasePath(coach_slug)
    const { user, hasClientRow } = await getWorkoutHistoryUser()
    if (!user) redirect(`${base}/login`)
    if (!hasClientRow) redirect(`${base}/login`)

    const extended = range === String(EXTENDED_DAYS)
    const daysBack = extended ? EXTENDED_DAYS : DEFAULT_DAYS
    const monthsLabel = extended ? '6 meses' : '3 meses'
    const items = await getWorkoutHistoryDayCounts(user.id, daysBack)

    return (
        <div className="min-h-dvh bg-background">
            <div className="mx-auto max-w-2xl px-5 pb-6 pt-safe">
                {/* Header — inline (no sticky), 1:1 con kit HistorialEntrenos */}
                <div className="flex items-center gap-[11px] pb-4 pt-1.5">
                    <Link
                        href={`${base}/dashboard`}
                        className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-surface-sunken text-strong"
                        aria-label="Volver al inicio"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </Link>
                    <span
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[var(--radius-md)]"
                        style={{
                            backgroundColor: 'color-mix(in srgb, var(--theme-primary) 12%, transparent)',
                            color: 'var(--theme-primary)',
                        }}
                    >
                        <Dumbbell className="h-[19px] w-[19px]" />
                    </span>
                    <div className="min-w-0">
                        <h1 className="font-display text-[21px] font-black leading-none tracking-[-0.02em] text-strong">
                            Historial de entrenos
                        </h1>
                        <p className="mt-0.5 text-[12.5px] text-muted">
                            Días con series registradas (últimos {monthsLabel})
                        </p>
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="px-5 py-12 text-center text-subtle">
                        <div className="mb-2.5 flex justify-center opacity-40">
                            <Calendar className="h-[34px] w-[34px]" />
                        </div>
                        <p className="text-sm leading-normal">
                            Aún no hay series registradas en este periodo. Cuando completes entrenos, aparecerán aquí.
                        </p>
                    </div>
                ) : (
                    <>
                        <Card padding="none" className="overflow-hidden">
                            <WorkoutHistoryList items={items} />
                        </Card>
                        {!extended && (
                            <Link
                                href={`${base}/workout-history?range=${EXTENDED_DAYS}`}
                                className="mt-3.5 flex h-11 w-full items-center justify-center gap-1.5 rounded-pill border-[1.5px] border-default bg-surface-card text-[13.5px] font-bold text-strong"
                            >
                                <ChevronDown className="h-4 w-4" />
                                Ver últimos 6 meses
                            </Link>
                        )}
                        <p className="mt-4 text-center text-[11.5px] leading-[1.45] text-subtle">
                            Solo ves tus propios registros. Mostrando los últimos {monthsLabel}.
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}
