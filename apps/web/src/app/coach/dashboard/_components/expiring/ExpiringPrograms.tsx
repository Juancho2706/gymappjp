'use client'

import Link from 'next/link'
import { Clock, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { ListRow } from '@/components/ui/list-row'
import { Badge } from '@/components/ui/badge'
import type { ExpiringProgramItem } from '../../_data/types'

export function ExpiringPrograms({ items }: { items: ExpiringProgramItem[] }) {
    return (
        <Card padding="none" className="h-full">
            <header className="flex items-center gap-2 px-4 pb-1 pt-4">
                <Clock className="size-4 text-[var(--warning-500)]" />
                <h2 className="font-display text-lg font-black tracking-[-0.02em] text-[var(--text-strong)]">
                    Programas por vencer
                </h2>
            </header>

            {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                    Sin programas vencidos ni por vencer.
                </p>
            ) : (
                <div className="flex flex-col px-2 pb-2">
                    {items.map((p, i) => {
                        const expired = p.daysLeft <= 0
                        return (
                            <Link
                                key={p.id}
                                href={p.clientId ? `/coach/clients/${p.clientId}` : '/coach/programs'}
                                className={cn(
                                    'block rounded-control outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]',
                                    i > 0 && 'border-t border-border-subtle'
                                )}
                            >
                                <ListRow
                                    className="cursor-pointer rounded-none hover:bg-surface-sunken"
                                    leading={
                                        <span
                                            className={cn(
                                                'flex size-8 items-center justify-center rounded-full',
                                                expired
                                                    ? 'bg-[var(--danger-100)] text-[var(--danger-600)]'
                                                    : 'bg-[var(--warning-100)] text-[var(--warning-600)]'
                                            )}
                                        >
                                            <CalendarClock className="size-4" />
                                        </span>
                                    }
                                    title={p.clientName ?? 'Sin alumno'}
                                    subtitle={p.name}
                                    trailing={
                                        <Badge tone={expired ? 'danger' : 'warning'} variant="soft" size="sm">
                                            {expired ? 'Vencido' : `${p.daysLeft}d`}
                                        </Badge>
                                    }
                                    showChevron
                                />
                            </Link>
                        )
                    })}
                </div>
            )}
        </Card>
    )
}
