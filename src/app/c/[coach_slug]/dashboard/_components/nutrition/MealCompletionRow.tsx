'use client'

import { useOptimistic, useTransition } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTodayInSantiago } from '@/lib/date-utils'
import { toggleMealCompletion } from '@/app/c/[coach_slug]/nutrition/_actions/nutrition.actions'
import { useRouter } from 'next/navigation'

interface MealCompletionRowProps {
    mealId: string
    name: string
    completed: boolean
    clientId: string
    planId: string
    dailyLogId: string | undefined
    coachSlug: string
}

export function MealCompletionRow({
    mealId,
    name,
    completed,
    clientId,
    planId,
    dailyLogId,
    coachSlug,
}: MealCompletionRowProps) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [optimistic, setOptimistic] = useOptimistic(completed, (_current, next: boolean) => next)

    const onToggle = () => {
        const next = !optimistic
        startTransition(async () => {
            setOptimistic(next)
            await toggleMealCompletion(
                clientId,
                planId,
                mealId,
                next,
                dailyLogId,
                coachSlug,
                getTodayInSantiago().iso
            )
            router.refresh()
        })
    }

    return (
        <button
            type="button"
            disabled={pending}
            onClick={onToggle}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-3 py-2 text-left transition-colors hover:bg-accent/30',
                pending && 'opacity-60'
            )}
        >
            <span
                className={cn(
                    'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                    optimistic ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border bg-muted'
                )}
            >
                {pending ?
                    <Loader2 className="h-4 w-4 animate-spin text-current" aria-hidden />
                :   <motion.svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="stroke-current">
                    <motion.path
                        d="M5 13l4 4L19 7"
                        strokeWidth="2"
                        strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: optimistic ? 1 : 0, opacity: optimistic ? 1 : 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                    />
                </motion.svg>
                }
            </span>
            <span className={`min-w-0 flex-1 text-sm font-medium ${optimistic ? 'text-muted-foreground line-through' : ''}`}>{name}</span>
        </button>
    )
}
