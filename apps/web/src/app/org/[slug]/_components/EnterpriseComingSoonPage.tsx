import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

interface EnterpriseComingSoonPageProps {
    orgSlug: string
    title: string
    eyebrow: string
    description: string
    icon: LucideIcon
    accent?: 'amber' | 'emerald' | 'sky' | 'rose'
    capabilities: string[]
    nextSteps: string[]
}

const ACCENT_STYLES = {
    amber: {
        ring: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
        glow: 'from-amber-500/20',
    },
    emerald: {
        ring: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
        glow: 'from-emerald-500/20',
    },
    sky: {
        ring: 'border-sky-400/30 bg-sky-400/10 text-sky-300',
        glow: 'from-sky-500/20',
    },
    rose: {
        ring: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
        glow: 'from-rose-500/20',
    },
}

export function EnterpriseComingSoonPage({
    orgSlug,
    title,
    eyebrow,
    description,
    icon: Icon,
    accent = 'amber',
    capabilities,
    nextSteps,
}: EnterpriseComingSoonPageProps) {
    const styles = ACCENT_STYLES[accent]

    return (
        <div className="min-h-full bg-zinc-950 text-zinc-100">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
                <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-2xl shadow-black/20 md:p-8">
                    <div
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.glow} via-transparent to-transparent`}
                    />
                    <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                        <div className="max-w-2xl">
                            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${styles.ring}`}>
                                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                {eyebrow}
                            </span>
                            <h1 className="mt-5 text-3xl font-black tracking-tight text-white md:text-5xl">
                                {title}
                            </h1>
                            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400 md:text-base">
                                {description}
                            </p>
                        </div>
                        <Link
                            href={`/org/${orgSlug}`}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-sm font-bold text-zinc-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                        >
                            Volver al dashboard
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </div>
                </section>

                <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 md:p-6">
                        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">
                            Capacidades planeadas
                        </h2>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            {capabilities.map((item) => (
                                <div key={item} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                                    <p className="text-sm leading-5 text-zinc-300">{item}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 md:p-6">
                        <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">
                            Siguientes decisiones
                        </h2>
                        <ol className="mt-5 space-y-3">
                            {nextSteps.map((item, index) => (
                                <li key={item} className="flex gap-3">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                                        {index + 1}
                                    </span>
                                    <p className="pt-1 text-sm leading-5 text-zinc-300">{item}</p>
                                </li>
                            ))}
                        </ol>
                    </section>
                </div>
            </div>
        </div>
    )
}

