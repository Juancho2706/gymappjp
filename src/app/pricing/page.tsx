import Link from 'next/link'
import { Check, Zap, Crown, Dumbbell, Sprout, TrendingUp } from 'lucide-react'
import type { Metadata } from 'next'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import {
    BILLING_CYCLE_CONFIG,
    getDefaultBillingCycleForTier,
    getTierAllowedBillingCycles,
    getTierBillingCycleSummary,
    getTierNutritionSummary,
    getTierPriceClp,
    TIER_CONFIG,
    TIER_STUDENT_RANGE_LABEL,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'

export const metadata: Metadata = {
    title: 'Precios | EVA',
    description: 'Elige el plan perfecto para tu negocio de coaching fitness. Plan gratuito disponible.',
    openGraph: {
        title: 'Precios EVA',
        description: 'Planes en CLP con cobro mensual, trimestral o anual para coaches.',
        url: 'https://www.eva-app.cl/pricing',
        siteName: 'EVA',
        type: 'website',
    },
}

const planDisplay: Array<{
    id: SubscriptionTier
    description: string
    icon: typeof Zap
    color: string
    bg: string
    border: string
    popular?: boolean
    badge?: string
}> = [
    {
        id: 'free',
        description: 'Probá EVA sin tarjeta de crédito',
        icon: Sprout,
        color: 'text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/20',
        badge: 'Gratis para siempre',
    },
    {
        id: 'starter',
        description: 'Para coaches que están comenzando',
        icon: Zap,
        color: 'text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/20',
    },
    {
        id: 'pro',
        description: 'El favorito de los coaches activos',
        icon: Crown,
        color: 'text-violet-400',
        bg: 'bg-violet-500/10',
        border: 'border-violet-500/20',
        popular: true,
    },
    {
        id: 'elite',
        description: 'Para escalar con analítica avanzada',
        icon: Dumbbell,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
    },
    {
        id: 'growth',
        description: 'Para academias y coaches consolidados',
        icon: TrendingUp,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        badge: 'Nuevo',
    },
    {
        id: 'scale',
        description: 'Operación avanzada para alto volumen',
        icon: Crown,
        color: 'text-rose-300',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/25',
    },
]

const cycleOrder: BillingCycle[] = ['monthly', 'quarterly', 'annual']

export default function PricingPage() {
    return (
        <div className="min-h-dvh bg-background">
            {/* Header */}
            <header className="border-b border-border px-6 py-4 flex items-center justify-between">
                <LandingBrandMark iconClassName="h-8 w-8 sm:h-9 sm:w-9" />
                <Link
                    href="/login"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    Ya tengo cuenta →
                </Link>
            </header>

            {/* Hero */}
            <div className="text-center px-6 py-16 max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-violet-300 mb-6">
                    <Zap className="w-3 h-3" />
                    Empezá gratis — sin tarjeta de crédito
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold text-zinc-50 mb-4 leading-tight">
                    Precios en CLP,<br />
                    <span className="text-violet-400">para cada etapa de tu negocio</span>
                </h1>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                    Empezá gratis con 3 alumnos. Cuando tu negocio crezca, elegí el plan que se adapta.
                </p>
            </div>

            {/* Plans — 3 groups */}
            <div className="px-6 pb-20 max-w-6xl mx-auto">

                {/* Group 1: Free */}
                <div className="mb-3 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Empezá gratis</span>
                    <div className="flex-1 border-t border-border" />
                </div>
                <div className="grid grid-cols-1 md:max-w-sm md:mx-0 gap-6 mb-10">
                    {planDisplay.filter((p) => p.id === 'free').map((plan) => (
                        <PlanCard key={plan.id} plan={plan} cycleOrder={cycleOrder} />
                    ))}
                </div>

                {/* Group 2: Individual coaches */}
                <div className="mb-3 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Coach individual</span>
                    <div className="flex-1 border-t border-border" />
                    <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400">Mensual o anual</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                    {planDisplay.filter((p) => ['starter', 'pro'].includes(p.id)).map((plan) => (
                        <PlanCard key={plan.id} plan={plan} cycleOrder={cycleOrder} />
                    ))}
                </div>

                {/* Group 3: Established business */}
                <div className="mb-3 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Negocio establecido</span>
                    <div className="flex-1 border-t border-border" />
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Mensual, trimestral o anual</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {planDisplay.filter((p) => ['elite', 'growth', 'scale'].includes(p.id)).map((plan) => (
                        <PlanCard key={plan.id} plan={plan} cycleOrder={cycleOrder} />
                    ))}
                </div>

                <section className="mt-12 grid gap-4 md:grid-cols-2">
                    <article className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold text-foreground">¿Cuándo se cobra?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            El Free es gratuito para siempre. Los planes pagos se cobran al activarlos y se renuevan según el ciclo elegido.
                        </p>
                    </article>
                    <article className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold text-foreground">¿Puedo cambiar de plan?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Sí. Desde tu panel podés hacer upgrade en cualquier momento. El nuevo plan se activa al término del ciclo actual.
                        </p>
                    </article>
                    <article className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold text-foreground">¿Puedo cancelar en cualquier momento?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Sí. Al cancelar, conservás acceso completo hasta el último día del período que ya pagaste. Luego pasás al plan Free automáticamente.
                        </p>
                    </article>
                    <article className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold text-foreground">¿Hay soporte?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Soporte por correo para todos los planes. Respuesta priorizada en tiers superiores.
                        </p>
                    </article>
                </section>

                {/* Enterprise callout */}
                <p className="mt-10 text-center text-xs text-muted-foreground">
                    ¿Necesitas más de 500 alumnos o funciones personalizadas? Tenemos{' '}
                    <strong className="text-foreground">planes empresariales</strong>.{' '}
                    Escríbenos a{' '}
                    <a href="mailto:contacto@eva-app.cl" className="underline hover:text-foreground transition-colors">
                        contacto@eva-app.cl
                    </a>
                </p>
            </div>
        </div>
    )
}

function PlanCard({
    plan,
    cycleOrder,
}: {
    plan: (typeof planDisplay)[0]
    cycleOrder: BillingCycle[]
}) {
    const Icon = plan.icon
    const tier = TIER_CONFIG[plan.id]
    const isFree = plan.id === 'free'
    const allowedCycles = getTierAllowedBillingCycles(plan.id)

    return (
        <div
            className={`relative bg-card border rounded-2xl p-6 flex flex-col ${
                plan.popular
                    ? 'border-violet-500/40 shadow-[0_0_40px_rgba(139,92,246,0.12)]'
                    : 'border-border'
            }`}
        >
            {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Más popular
                </div>
            )}
            {plan.badge && !plan.popular && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold px-3 py-1 rounded-full ${
                    plan.badge === 'Nuevo'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-600 text-white'
                }`}>
                    {plan.badge}
                </div>
            )}

            <div className={`w-10 h-10 rounded-xl ${plan.bg} border ${plan.border} flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${plan.color}`} />
            </div>

            <h2 className="text-lg font-bold text-foreground mb-1">{tier.label}</h2>
            <p className="text-muted-foreground text-sm mb-3">{plan.description}</p>
            <p className="text-xs text-muted-foreground mb-3">
                {TIER_STUDENT_RANGE_LABEL[plan.id]} · Hasta {tier.maxClients} alumnos
            </p>

            <div className="mb-4 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {getTierBillingCycleSummary(plan.id)}
                </span>
                <span
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        getTierNutritionSummary(plan.id).startsWith('Sin')
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    }`}
                >
                    {getTierNutritionSummary(plan.id)}
                </span>
            </div>

            {/* Pricing rows */}
            <div className="space-y-2 mb-6">
                {isFree ? (
                    <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                        <span className="text-sm text-muted-foreground">Siempre</span>
                        <span className="text-sm font-bold text-emerald-500">$0 — Gratis</span>
                    </div>
                ) : (
                    cycleOrder
                        .filter((cycle) => allowedCycles.includes(cycle))
                        .map((cycle) => {
                            const cycleInfo = BILLING_CYCLE_CONFIG[cycle]
                            const totalPrice = getTierPriceClp(plan.id, cycle)
                            // Show annualized monthly equivalent for non-monthly cycles
                            const monthlyEquiv = cycle !== 'monthly'
                                ? Math.round(totalPrice / cycleInfo.months)
                                : null
                            return (
                                <div key={cycle} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                                    <span className="text-sm text-muted-foreground">{cycleInfo.label}</span>
                                    <div className="text-right">
                                        <span className="text-sm font-semibold text-foreground">
                                            ${totalPrice.toLocaleString('es-CL')} CLP
                                        </span>
                                        {monthlyEquiv && (
                                            <p className="text-[11px] text-muted-foreground">
                                                ≈ ${monthlyEquiv.toLocaleString('es-CL')}/mes
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                )}
            </div>

            <ul className="space-y-3 mb-8 flex-1">
                {tier.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                        {feat}
                    </li>
                ))}
            </ul>

            <Link
                href={isFree ? '/register?tier=free' : `/register?tier=${plan.id}&cycle=${getDefaultBillingCycleForTier(plan.id)}`}
                className={`w-full py-3 rounded-xl text-sm font-semibold text-center transition-all duration-200 block ${
                    isFree
                        ? 'bg-slate-700 hover:bg-slate-600 text-foreground border border-border'
                        : plan.popular
                        ? 'bg-violet-600 hover:bg-violet-500 text-white'
                        : 'bg-secondary hover:bg-zinc-700 text-foreground border border-border hover:border-accent'
                }`}
            >
                {isFree ? 'Empezar gratis' : 'Elegir plan'}
            </Link>
        </div>
    )
}
