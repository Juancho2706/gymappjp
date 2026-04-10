import Link from 'next/link'
import { Check, Zap, Crown, Dumbbell } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Precios | EVA',
    description: 'Elige el plan perfecto para tu negocio de coaching fitness.',
}

const plans = [
    {
        name: 'Starter',
        price: '49',
        period: '/mes',
        description: 'Para coaches que están comenzando',
        icon: Zap,
        color: 'text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/20',
        buttonClass: 'bg-secondary hover:bg-zinc-700 text-foreground border border-border hover:border-accent',
        features: [
            'Hasta 10 alumnos',
            'Rutinas ilimitadas',
            'App white-label para alumnos',
            'Seguimiento de progreso',
            'Check-ins semanales',
        ],
        cta: 'Empezar ahora',
        popular: false,
    },
    {
        name: 'Pro',
        price: '99',
        period: '/mes',
        description: 'El favorito de los coaches activos',
        icon: Crown,
        color: 'text-violet-400',
        bg: 'bg-violet-500/10',
        border: 'border-violet-500/20',
        buttonClass:
            'bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)]',
        features: [
            'Hasta 50 alumnos',
            'Todo en Starter',
            'Constructor de rutinas DnD',
            'Logo y colores personalizados',
            'PWA instalable (app nativa)',
            'Soporte prioritario',
        ],
        cta: 'Comenzar con Pro',
        popular: true,
    },
    {
        name: 'Elite',
        price: '199',
        period: '/mes',
        description: 'Para agencias y coaches high-ticket',
        icon: Dumbbell,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        buttonClass: 'bg-secondary hover:bg-zinc-700 text-foreground border border-border hover:border-accent',
        features: [
            'Alumnos ilimitados',
            'Todo en Pro',
            'Multi-coach (equipo)',
            'API access',
            'Onboarding dedicado',
            'SLA garantizado',
        ],
        cta: 'Hablar con ventas',
        popular: false,
    },
]

export default function PricingPage() {
    return (
        <div className="min-h-screen bg-background">
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
                    Elige el plan ideal para ti
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold text-zinc-50 mb-4 leading-tight">
                    Precios simples,<br />
                    <span className="text-violet-400">valor sin límites</span>
                </h1>
                <p className="text-muted-foreground text-lg max-w-xl mx-auto">
                    Tu marca. Tus alumnos. Tu app. EVA le da a tu negocio
                    la tecnología de una startup sin el costo de una.
                </p>
            </div>

            {/* Plans */}
            <div className="px-6 pb-20 max-w-5xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => {
                        const Icon = plan.icon
                        return (
                            <div
                                key={plan.name}
                                className={`relative bg-card border rounded-2xl p-6 flex flex-col ${plan.popular
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

                                <h2 className="text-lg font-bold text-foreground mb-1">{plan.name}</h2>
                                <p className="text-muted-foreground text-sm mb-4">{plan.description}</p>

                                <div className="flex items-baseline gap-1 mb-6">
                                    <span className="text-muted-foreground text-sm">USD</span>
                                    <span className="text-4xl font-bold text-zinc-50">
                                        ${plan.price}
                                    </span>
                                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                                </div>

                                <ul className="space-y-3 mb-8 flex-1">
                                    {plan.features.map((feat) => (
                                        <li key={feat} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                                            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                                            {feat}
                                        </li>
                                    ))}
                                </ul>

                                <Link
                                    href="/login"
                                    className={`w-full py-3 rounded-xl text-sm font-semibold text-center transition-all duration-200 block ${plan.buttonClass}`}
                                >
                                    {plan.cta}
                                </Link>
                            </div>
                        )
                    })}
                </div>

                {/* FAQ teaser */}
                <p className="text-center text-muted-foreground text-sm mt-12">
                    ¿Tienes preguntas?{' '}
                    <Link href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">
                        Contáctanos
                    </Link>
                </p>
            </div>
        </div>
    )
}
