'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { logSetAction } from '@/app/c/[coach_slug]/workout/[planId]/actions'
import { springs } from '@/lib/animation-presets'
import type { HeroBlock } from './WorkoutHeroCard'

interface QuickLogSheetProps {
    blocks: HeroBlock[]
    coachSlug: string
    baseLoggedPerBlock: Record<string, number>
    totalSetsTarget: number
}

export function QuickLogSheet({ blocks, coachSlug, baseLoggedPerBlock, totalSetsTarget }: QuickLogSheetProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [loggedByBlock, setLoggedByBlock] = useState<Record<string, number>>({})
    const [pending, startTransition] = useTransition()

    const totalLogged = useMemo(() => {
        const base = blocks.reduce((s, b) => s + (baseLoggedPerBlock[b.id] ?? 0), 0)
        const extra = Object.values(loggedByBlock).reduce((a, b) => a + b, 0)
        return base + extra
    }, [blocks, baseLoggedPerBlock, loggedByBlock])

    const logOne = useCallback(
        (blockId: string, base: number, extra: number, maxSets: number) => {
            const currentSets = base + extra
            if (currentSets >= maxSets) return
            const next = currentSets + 1
            startTransition(async () => {
                const fd = new FormData()
                fd.set('block_id', blockId)
                fd.set('set_number', String(next))
                fd.set('weight_kg', '0')
                const res = await logSetAction({}, fd)
                if (res.success) {
                    setLoggedByBlock((prev) => ({ ...prev, [blockId]: (prev[blockId] ?? 0) + 1 }))
                    router.refresh()
                }
            })
        },
        [router]
    )

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-xl border border-border bg-secondary/50 px-4 text-[10px] font-bold uppercase tracking-widest text-foreground backdrop-blur-md transition-colors hover:bg-secondary dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
                Rápido
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] sm:max-w-md sm:data-[side=right]:max-w-md" data-side="bottom">
                <SheetHeader>
                    <SheetTitle>Log rápido</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-3 overflow-y-auto p-4 pt-0">
                    <p className="text-xs text-muted-foreground">
                        {totalLogged}/{totalSetsTarget} series · {coachSlug}
                    </p>
                    {blocks.map((b) => {
                        const base = baseLoggedPerBlock[b.id] ?? 0
                        const extra = loggedByBlock[b.id] ?? 0
                        const done = base + extra
                        return (
                            <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/50 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{b.exercise.name}</p>
                                    <p className="text-[10px] text-muted-foreground">
                                        {done}/{b.sets} series hoy
                                    </p>
                                </div>
                                <motion.button
                                    type="button"
                                    disabled={pending || done >= b.sets}
                                    whileTap={{ scale: 0.9 }}
                                    transition={springs.elastic}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--theme-primary)]/40 bg-[color:var(--theme-primary)]/10 text-[color:var(--theme-primary)] disabled:opacity-40"
                                    onClick={() => logOne(b.id, base, extra, b.sets)}
                                    aria-label="Añadir serie"
                                >
                                    <Plus className="h-5 w-5" />
                                </motion.button>
                            </div>
                        )
                    })}
                </div>
            </SheetContent>
        </Sheet>
    )
}
