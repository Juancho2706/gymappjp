import Link from 'next/link'
import { Check, Palette, Sparkles, ArrowRight, Image as ImageIcon, Type, MessageSquare } from 'lucide-react'
import { UpgradeGateTracker } from '@/components/analytics/UpgradeGateTracker'
import type { SubscriptionTier } from '@/lib/constants'

/**
 * Upsell de Mi Marca para tiers sin branding — espejo fiel de `MiMarcaUpsell` del kit
 * (hero sport-100 + antes/después + features + pricing inversa). Ya NO reemplaza el hub
 * Opciones: se monta como sub-pantalla (/coach/settings/brand en mobile) y como pane
 * "Mi Marca" de la SettingsShell desktop, con la card del hub badge "Pro" como puerta.
 */
export function BrandUpsell({ tier }: { tier: SubscriptionTier }) {
    return (
        <div className="space-y-4">
            <UpgradeGateTracker gate="branding" currentTier={tier} />
            {/* Hero */}
            <div className="rounded-card border p-6 text-center" style={{ background: 'var(--sport-100)', borderColor: 'var(--sport-200)' }}>
                <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-control bg-[var(--sport-500)] text-[var(--text-on-sport)]">
                    <Sparkles className="h-6 w-6" />
                </span>
                <h1 className="font-display text-2xl font-black tracking-tight text-strong">
                    Tus alumnos entran a <span style={{ color: 'var(--sport-600)' }}>tu</span> app
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-body">
                    Con tu logo, tus colores y tu nombre. Tu marca, no la nuestra — disponible desde Starter.
                </p>
            </div>

            {/* Before / after app mockup */}
            <p className="px-1 text-[11px] font-extrabold uppercase tracking-[0.07em]" style={{ color: 'var(--text-subtle)' }}>
                Así lo ven tus alumnos
            </p>
            <div className="grid grid-cols-2 gap-3">
                <div className="overflow-hidden rounded-card border border-subtle bg-surface-card shadow-[var(--shadow-sm)]">
                    <div className="flex items-center gap-2 px-3 py-2.5" style={{ background: '#2b333d' }}>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                            <span className="text-[9px] font-bold text-white">E</span>
                        </div>
                        <span className="text-[11px] font-semibold text-white/90">EVA Fitness</span>
                    </div>
                    <div className="space-y-2 p-3">
                        <div className="h-2 w-3/4 rounded-full bg-surface-sunken" />
                        <div className="flex gap-1.5">
                            <div className="h-7 flex-1 rounded-lg bg-surface-sunken" />
                            <div className="h-7 flex-1 rounded-lg bg-surface-sunken" />
                        </div>
                        <div className="h-6 w-full rounded-lg" style={{ background: 'var(--ink-300)' }} />
                    </div>
                    <p className="px-3 pb-3 text-[10px] font-bold text-subtle">Sin tu marca (ahora)</p>
                </div>
                <div className="overflow-hidden rounded-card border bg-surface-card shadow-[var(--shadow-sm)]" style={{ borderColor: 'var(--sport-300)' }}>
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--sport-500)]">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25">
                            <span className="text-[9px] font-bold text-white">T</span>
                        </div>
                        <span className="text-[11px] font-semibold text-white">Tu Marca</span>
                    </div>
                    <div className="space-y-2 p-3">
                        <div className="h-2 w-3/4 rounded-full" style={{ background: 'var(--sport-200)' }} />
                        <div className="flex gap-1.5">
                            <div className="h-7 flex-1 rounded-lg" style={{ background: 'var(--sport-100)' }} />
                            <div className="h-7 flex-1 rounded-lg bg-surface-sunken" />
                        </div>
                        <div className="h-6 w-full rounded-lg bg-[var(--sport-500)]" />
                    </div>
                    <p className="px-3 pb-3 text-[10px] font-bold" style={{ color: 'var(--sport-600)' }}>Con Starter ✓</p>
                </div>
            </div>

            {/* Features */}
            <div className="overflow-hidden rounded-card border border-subtle bg-surface-card">
                {([
                    [ImageIcon, 'Tu logo', 'En el login, el dashboard y la pantalla de carga.'],
                    [Palette, 'Tus colores', 'El color de tu marca tiñe botones, acentos y gráficos.'],
                    [Type, 'Tu nombre', 'La app deja de decir "EVA": dice el nombre de tu marca.'],
                    [MessageSquare, 'Tu mensaje', 'Bienvenida y modal de inicio con tu voz.'],
                ] as const).map(([Icon, title, desc], i) => (
                    <div key={title} className={`flex gap-3 p-3.5 ${i ? 'border-t border-subtle' : ''}`}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control" style={{ background: 'var(--sport-100)', color: 'var(--sport-600)' }}>
                            <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-strong">{title}</p>
                            <p className="mt-0.5 text-xs leading-snug text-muted">{desc}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pricing + CTA */}
            <div className="rounded-card p-6 text-center bg-[var(--surface-inverse)]">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-on-dark-muted">Disponible en Starter</p>
                <div className="mt-1.5 flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
                    <span className="font-display text-3xl font-black tabular-nums text-on-dark">$19.990</span>
                    <span className="text-sm text-on-dark-muted">/mes</span>
                    <span className="text-on-dark-muted">·</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--sport-400)' }}>$15.992/mes anual</span>
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.12)', color: 'var(--success-500)' }}>−20%</span>
                </div>

                <ul className="mx-auto mt-5 max-w-xs space-y-2.5 text-left">
                    {[
                        'Tu logo en la app del alumno',
                        'Colores y nombre de tu marca',
                        'Loader y pantalla de carga personalizados',
                        'Hasta 10 alumnos activos',
                    ].map((feat) => (
                        <li key={feat} className="flex items-start gap-2.5 text-sm text-on-dark-muted">
                            <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--sport-400)' }} />
                            {feat}
                        </li>
                    ))}
                </ul>

                <Link
                    href="/coach/subscription?upgrade=starter"
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-control px-6 text-sm font-bold transition-all bg-[var(--sport-500)] text-[var(--text-on-sport)] shadow-[var(--glow-sport)] hover:bg-[var(--cta-fill)]"
                >
                    Personalizá tu app con Starter
                    <ArrowRight className="h-4 w-4" />
                </Link>
                <p className="mt-3 text-xs text-on-dark-muted">Sin permanencia · Cancelá cuando quieras</p>
            </div>
        </div>
    )
}
