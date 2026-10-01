'use client'

import Link from 'next/link'
import { ArrowRight, Dumbbell } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBasePath } from '@/components/client/BasePathProvider'

/**
 * El alumno todavía no tiene NINGÚN programa (plan B «Activación», owner 01-10). Antes caía al
 * `RestDayCard` («Día de descanso · Recupera bien para la próxima sesión»), que le decía que no
 * había nada que hacer. Espejo 1:1 de `NoPlanCard` de RN (`components/alumno/home/HeroSection.tsx`),
 * que ya resolvía este caso: mismo título, mismo texto y el mismo «Hacer un check-in».
 */
export function NoPlanCard({ coachSlug, coachName }: { coachSlug: string; coachName: string | null }) {
    const base = useBasePath(`/c/${coachSlug}`)
    return (
        <Card padding="lg" className="items-center gap-0 text-center">
            <div
                className="mb-3 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--sport-500)_10%,transparent)] text-[var(--sport-500)]"
                aria-hidden
            >
                <Dumbbell className="h-7 w-7" strokeWidth={2.25} />
            </div>
            <h2 className="font-display text-xl font-black tracking-[-0.02em] text-strong">Tu coach está armando tu plan</h2>
            <p className="mt-1.5 max-w-[300px] text-[13.5px] leading-relaxed text-muted">
                {coachName?.trim() || 'Tu coach'} está preparando tu programa. Te avisamos apenas esté listo.
            </p>
            <Link href={`${base}/check-in`} className={cn(buttonVariants({ variant: 'sport', size: 'lg' }), 'mt-4')}>
                Hacer un check-in
                <ArrowRight className="h-5 w-5" />
            </Link>
        </Card>
    )
}
