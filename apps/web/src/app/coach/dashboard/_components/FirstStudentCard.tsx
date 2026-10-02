import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { personaNoun, type Persona } from '@eva/schemas'
import { FIRST_STUDENT_WEB_HREF, firstStudentCardCopy } from '@eva/onboarding'
import { cn } from '@/lib/utils'

/**
 * «Tu primer alumno» — lo PRIMERO del panel mientras el coach tenga 0 alumnos reales (plan B
 * «Activación», owner 01-10, maqueta `F1yd1V2b`). Ocupa el lugar de la tarjeta oscura de
 * prioridad, que con 0 alumnos felicitaba algo que no pasó, y usa su misma superficie inversa para
 * no romper el ritmo del panel.
 *
 * El CTA abre el alta guiada de 3 pasos (`?invite=1`), que termina con el acceso listo para
 * WhatsApp. Nunca el link `/join`: desde el 21-08 ese link deja una solicitud, no un alumno.
 *
 * `layout`: `stack` en el panel móvil/PWA; `wide` en el bento de escritorio (pasos en fila y el
 * botón a la derecha).
 */
export function FirstStudentCard({
    persona,
    layout = 'stack',
}: {
    persona: Persona | null
    layout?: 'stack' | 'wide'
}) {
    const copy = firstStudentCardCopy(personaNoun(persona ?? 'other'))
    const wide = layout === 'wide'

    return (
        <section
            aria-labelledby="first-student-title"
            className={cn(
                'rounded-card border border-[var(--border-inverse)] p-4 [background:linear-gradient(165deg,var(--surface-inverse-2)_0%,var(--surface-inverse)_100%)] dark:[background:linear-gradient(165deg,color-mix(in_srgb,var(--surface-card)_70%,var(--surface-app))_0%,var(--surface-app)_100%)]',
                wide ? 'flex items-center gap-6 p-5' : 'flex flex-col gap-3.5'
            )}
            style={{ boxShadow: '0 10px 30px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.09)' }}
        >
            <div className={cn('flex min-w-0 flex-col gap-3', wide && 'flex-1')}>
                <span className="text-[11px] font-extrabold uppercase leading-[1.4] tracking-[0.08em] text-sport-400">
                    {copy.eyebrow}
                </span>
                <h2
                    id="first-student-title"
                    className="font-display text-[20px] font-black leading-[1.12] tracking-[-0.02em] text-[var(--text-on-dark)]"
                >
                    {copy.title}
                </h2>
                <ol className={cn('flex gap-2.5', wide ? 'flex-row flex-wrap gap-x-6' : 'flex-col')}>
                    {copy.steps.map((step, i) => (
                        <li key={step.title} className="flex items-start gap-2.5 text-[13px] leading-snug">
                            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 font-mono text-[11px] font-bold text-[var(--text-on-dark)]">
                                {i + 1}
                            </span>
                            <span className="text-[var(--text-on-dark-muted)]">
                                <b className="font-bold text-[var(--text-on-dark)]">{step.title}.</b> {step.hint}
                            </span>
                        </li>
                    ))}
                </ol>
            </div>
            <div className={cn('flex flex-col gap-2', wide ? 'shrink-0 items-end' : 'items-stretch')}>
                <Link
                    href={FIRST_STUDENT_WEB_HREF}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] px-5 text-sm font-extrabold text-[var(--text-on-sport)] transition-colors hover:bg-[color-mix(in_oklab,var(--cta-fill)_92%,#000)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                >
                    {copy.cta}
                    <ArrowRight className="size-4" aria-hidden />
                </Link>
                <p className={cn('text-[12px] text-[var(--text-on-dark-muted)]', wide ? 'text-right' : 'text-center')}>
                    {copy.hint}
                </p>
            </div>
        </section>
    )
}
