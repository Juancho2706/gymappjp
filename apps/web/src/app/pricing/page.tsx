import Link from 'next/link'
import { Check, Zap, Crown, Dumbbell, Sprout, Users2 } from 'lucide-react'
import type { Metadata } from 'next'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { SALES_EMAIL, teamsContactMailto } from '@/lib/brand-assets'
import { resolveMetadataBase } from '@/lib/site-url'
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
    title: 'Precios en CLP — Software para Personal Trainers y Coaches',
    description:
        'Planes en pesos chilenos para personal trainers, coaches y gimnasios: rutinas, planes de nutricion y app con tu marca. Empieza gratis, sin tarjeta. Mensual, trimestral o anual.',
    alternates: { canonical: '/pricing' },
    openGraph: {
        title: 'Precios EVA',
        description: 'Planes en CLP con cobro mensual, trimestral o anual para coaches.',
        url: '/pricing',
        siteName: 'EVA',
        type: 'website',
    },
}

// FAQ — fuente única para el render visible Y el JSON-LD FAQPage (Google exige
// que el texto del structured data coincida exactamente con el visible).
const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
    {
        question: '¿Cuándo se cobra?',
        answer: 'El Free es gratuito para siempre. Los planes pagos se cobran al activarlos y se renuevan según el ciclo elegido.',
    },
    {
        question: '¿Puedo cambiar de plan?',
        answer: 'Sí. Desde tu panel puedes hacer upgrade en cualquier momento. El nuevo plan se activa al término del ciclo actual.',
    },
    {
        question: '¿Puedo cancelar en cualquier momento?',
        answer: 'Sí. Al cancelar, conservas acceso completo hasta el último día del período que ya pagaste. Luego pasas al plan Free automáticamente.',
    },
    {
        question: '¿Hay soporte?',
        answer: 'Soporte por correo para todos los planes. Respuesta priorizada en tiers superiores.',
    },
]

// JSON-LD para SEO/rich results. Precios desde la MISMA fuente que la UI (getTierPriceClp)
// para evitar drift. URLs absolutas vía resolveMetadataBase (host-agnóstico).
function buildStructuredData() {
    const base = resolveMetadataBase()
    const pricingUrl = new URL('/pricing', base).href

    const offerTiers: SubscriptionTier[] = ['free', 'starter', 'pro', 'elite']
    const registerUrl = (tier: SubscriptionTier) =>
        tier === 'free'
            ? new URL('/register?tier=free', base).href
            : new URL(`/register?tier=${tier}&cycle=${getDefaultBillingCycleForTier(tier)}`, base).href

    const offers = offerTiers.map((tier) => ({
        '@type': 'Offer',
        name: TIER_CONFIG[tier].label,
        price: String(getTierPriceClp(tier, 'monthly')),
        priceCurrency: 'CLP',
        availability: 'https://schema.org/InStock',
        url: registerUrl(tier),
    }))

    const softwareApplication = {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'EVA',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web, iOS, Android',
        url: pricingUrl,
        offers: {
            '@type': 'AggregateOffer',
            priceCurrency: 'CLP',
            lowPrice: '0',
            highPrice: String(getTierPriceClp('elite', 'monthly')),
            offerCount: 4,
            offers,
        },
    }

    const faqPage = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ_ITEMS.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
            },
        })),
    }

    const breadcrumbList = {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'Inicio',
                item: new URL('/', base).href,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: 'Precios',
                item: pricingUrl,
            },
        ],
    }

    return { softwareApplication, faqPage, breadcrumbList }
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
        description: 'Prueba EVA sin tarjeta de crédito',
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
    // LEGACY — growth/scale fuera de venta (grandfathered + placeholder team/org_managed). Recortados de planDisplay; runtime/DB/admin intactos. NO re-agregar aquí.
]

const cycleOrder: BillingCycle[] = ['monthly', 'quarterly', 'annual']

export default function PricingPage() {
    const { softwareApplication, faqPage, breadcrumbList } = buildStructuredData()
    return (
        <div className="min-h-dvh bg-background">
            {/* JSON-LD inline (server-rendered) → visible al crawler sin ejecutar JS. */}
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }}
            />
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
                    Empieza gratis — sin tarjeta de crédito
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold text-zinc-50 mb-4 leading-tight">
                    Precios en CLP,<br />
                    <span className="text-violet-400">para cada etapa de tu negocio</span>
                </h1>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                    Empieza gratis con 3 alumnos. Cuando tu negocio crezca, elige el plan que se adapta.
                </p>
            </div>

            {/* Plans — 3 groups */}
            <div className="px-6 pb-20 max-w-6xl mx-auto">

                {/* Group 1: Free */}
                <div className="mb-3 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Empieza gratis</span>
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
                {/* Elite + card "EVA Teams" (conversemos, sin números pre-cierre Movida — plan 02). */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {planDisplay.filter((p) => p.id === 'elite').map((plan) => (
                        <PlanCard key={plan.id} plan={plan} cycleOrder={cycleOrder} />
                    ))}
                    <TeamsContactCard />
                </div>

                <section className="mt-12 grid gap-4 md:grid-cols-2">
                    {FAQ_ITEMS.map((item) => (
                        <article key={item.question} className="rounded-2xl border border-border bg-card p-5">
                            <h3 className="text-sm font-semibold text-foreground">{item.question}</h3>
                            <p className="mt-2 text-sm text-muted-foreground">{item.answer}</p>
                        </article>
                    ))}
                </section>
            </div>
        </div>
    )
}

// Card "EVA Teams" del grupo "Negocio establecido" — conversemos, SIN números
// (regla dura project-movida-commercial, pre-cierre Movida). Mismo look que PlanCard.
function TeamsContactCard() {
    return (
        <div className="relative flex flex-col rounded-2xl border border-emerald-500/30 bg-card p-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                <Users2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            </div>

            <h2 className="mb-1 text-lg font-bold text-foreground">EVA Teams</h2>
            <p className="mb-3 text-sm text-muted-foreground">
                Para centros de entrenamiento y equipos multidisciplinarios.
            </p>

            <ul className="mb-8 flex-1 space-y-3">
                {['Pool de alumnos compartido', 'Marca de tu centro', 'Módulos profesionales'].map((cap) => (
                    <li key={cap} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" aria-hidden />
                        {cap}
                    </li>
                ))}
            </ul>

            <a
                href={teamsContactMailto('pricing-callout')}
                className="block w-full rounded-xl bg-emerald-600 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
                Conversemos
            </a>
            <p className="mt-2 text-center text-xs text-muted-foreground">{SALES_EMAIL}</p>
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
