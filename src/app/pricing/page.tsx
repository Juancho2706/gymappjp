import Link from 'next/link'
import { Check, Zap, Crown, Dumbbell, Rocket } from 'lucide-react'
import type { Metadata } from 'next'
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
    description: 'Elige el plan perfecto para tu negocio de coaching fitness.',
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
}> = [
    {
        id: 'starter_lite',
        description: 'Tier de entrada para empezar con bajo costo',
        icon: Rocket,
        color: 'text-emerald-300',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/25',
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
        id: 'scale',
        description: 'Operación avanzada para equipos y alto volumen',
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
                <Link href="/" className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
                        <Dumbbell className="w-4 h-4 text-violet-400" />
                    </div>
                    <span className="font-bold text-foreground text-sm">
                        EVA
                    </span>
                </Link>
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
                    Elige tu tier y frecuencia de pago
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold text-zinc-50 mb-4 leading-tight">
                    Precios en CLP,<br />
                    <span className="text-violet-400">según el ciclo de cada plan</span>
                </h1>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                    Incluye nuevo tier Starter Lite para mayor accesibilidad y
                    descuentos por prepago en planes trimestrales y anuales.
                </p>
                <div className="mt-8 mx-auto max-w-2xl rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 text-left text-sm text-muted-foreground">
                    <p className="font-semibold text-foreground mb-2">Resumen rápido</p>
                    <ul className="list-disc space-y-1 pl-5">
                        <li>
                            <strong className="text-foreground">Solo mensual:</strong> Starter Lite (1–5), Starter
                            (6–10) y Pro (11–30).
                        </li>
                        <li>
                            <strong className="text-foreground">Solo trimestral o anual:</strong> Elite (31–60) y Scale
                            (61–100).
                        </li>
                        <li>
                            <strong className="text-foreground">Nutrición:</strong> no incluida en Starter Lite ni Starter;
                            sí a partir de Pro.
                        </li>
                    </ul>
                </div>
            </div>

            {/* Plans */}
            <div className="px-6 pb-20 max-w-5xl mx-auto">
                {/* Group 1: Without nutrition */}
                <div className="mb-3 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Planes de entrenamiento</span>
                    <div className="flex-1 border-t border-border" />
                    <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Sin módulo de nutrición · Solo mensual</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {planDisplay.filter((p) => ['starter_lite', 'starter'].includes(p.id)).map((plan) => (
                        <PlanCard key={plan.id} plan={plan} cycleOrder={cycleOrder} />
                    ))}
                </div>

                {/* Group 2: With nutrition */}
                <div className="mb-3 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Planes completos con nutrición</span>
                    <div className="flex-1 border-t border-border" />
                    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Incluye nutrición</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {planDisplay.filter((p) => ['pro', 'elite', 'scale'].includes(p.id)).map((plan) => (
                        <PlanCard key={plan.id} plan={plan} cycleOrder={cycleOrder} />
                    ))}
                </div>

                <section className="mt-12 grid gap-4 md:grid-cols-2">
                    <article className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold text-foreground">¿Cuándo se cobra?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            El primer cobro se realiza al registrarte y luego se renueva según el ciclo elegido: mensual, trimestral o anual según el plan.
                        </p>
                    </article>
                    <article className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold text-foreground">¿Puedo cambiar de plan?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Sí. Desde tu panel puedes hacer upgrade o downgrade. El nuevo plan se activa al término de tu ciclo actual: sin cobros dobles, sin perder días ya pagados.
                        </p>
                    </article>
                    <article className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold text-foreground">¿Puedo cancelar en cualquier momento?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Sí. Al cancelar la renovación, conservas acceso completo hasta el último día del período que ya pagaste. No hay corte inmediato.
                        </p>
                    </article>
                    <article className="rounded-2xl border border-border bg-card p-5">
                        <h3 className="text-sm font-semibold text-foreground">¿Hay soporte?</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Soporte por correo con respuesta priorizada en tiers superiores.
                        </p>
                    </article>
                </section>

                {/* Enterprise callout */}
                <p className="mt-10 text-center text-xs text-muted-foreground">
                    ¿Necesitas más de 100 alumnos o funciones personalizadas? Tenemos{' '}
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

            <div className={`w-10 h-10 rounded-xl ${plan.bg} border ${plan.border} flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${plan.color}`} />
            </div>

            <h2 className="text-lg font-bold text-foreground mb-1">{tier.label}</h2>
            <p className="text-muted-foreground text-sm mb-3">{plan.description}</p>
            <p className="text-xs text-muted-foreground mb-3">
                {TIER_STUDENT_RANGE_LABEL[plan.id]} · Hasta {tier.maxClients} alumnos
            </p>

            {/* Billing cycle + nutrition badges — prominent */}
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

            <div className="space-y-2 mb-6">
                {cycleOrder
                    .filter((cycle) => getTierAllowedBillingCycles(plan.id).includes(cycle))
                    .map((cycle) => {
                        const cycleInfo = BILLING_CYCLE_CONFIG[cycle]
                        const price = getTierPriceClp(plan.id, cycle)
                        return (
                            <div key={cycle} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                                <span className="text-sm text-muted-foreground">{cycleInfo.label}</span>
                                <span className="text-sm font-semibold text-foreground">
                                    ${price.toLocaleString('es-CL')} CLP
                                </span>
                            </div>
                        )
                    })}
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
                href={`/register?tier=${plan.id}&cycle=${getDefaultBillingCycleForTier(plan.id)}`}
                className={`w-full py-3 rounded-xl text-sm font-semibold text-center transition-all duration-200 block ${
                    plan.popular
                        ? 'bg-violet-600 hover:bg-violet-500 text-white'
                        : 'bg-secondary hover:bg-zinc-700 text-foreground border border-border hover:border-accent'
                }`}
            >
                Elegir plan
            </Link>
        </div>
    )
}
