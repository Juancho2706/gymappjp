'use client'

import { Users2, ShieldCheck, BarChart3, ExternalLink } from 'lucide-react'
import { motion } from 'framer-motion'

const CALENDLY_URL = 'https://calendly.com/contacto-eva-app/eva-enterprise'
const CONTACT_EMAIL = 'contacto@eva-app.cl'

const VALUE_PROPS = [
    {
        icon: Users2,
        title: 'Pool de alumnos compartido',
        desc: 'Importa un CSV y asigna alumnos a cada coach con un clic. Sin hojas de cálculo duplicadas.',
    },
    {
        icon: ShieldCheck,
        title: 'Datos aislados por coach',
        desc: 'Cada coach ve solo sus alumnos asignados. Privacidad garantizada dentro de tu organización.',
    },
    {
        icon: BarChart3,
        title: 'Reportes de actividad',
        desc: 'Ve quién está activo, quién no ha logueado y el estado de tu equipo desde un solo panel.',
    },
]

export function LandingEnterpriseSection() {
    return (
        <section
            id="enterprise"
            className="scroll-mt-28 relative py-16 sm:py-20 border-t border-border/40 bg-muted/20 dark:bg-muted/10"
        >
            <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">

                {/* Eyebrow */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    className="text-center"
                >
                    <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
                        Para Gyms y Academias
                    </span>

                    <h2 className="mt-4 font-display text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                        Un panel para todo tu equipo
                    </h2>
                    <p className="mt-3 mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                        Gestiona coaches, alumnos y reportes desde un solo lugar.
                        Sin hojas de cálculo. Sin confusión entre coaches.
                    </p>
                </motion.div>

                {/* Value props */}
                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                    {VALUE_PROPS.map((prop, i) => {
                        const Icon = prop.icon
                        return (
                            <motion.div
                                key={prop.title}
                                initial={{ opacity: 0, y: 16 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-40px' }}
                                transition={{ duration: 0.4, delay: i * 0.08 }}
                                className="rounded-2xl border border-border bg-card p-5 shadow-sm shadow-black/5 dark:shadow-black/20"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <Icon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                </div>
                                <h3 className="mt-3 text-sm font-bold text-foreground">{prop.title}</h3>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{prop.desc}</p>
                            </motion.div>
                        )
                    })}
                </div>

                {/* Pricing + CTA */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.4, delay: 0.2 }}
                    className="mt-10 rounded-2xl border border-amber-500/20 border-t-[3px] border-t-amber-400/70 bg-card p-6 shadow-sm text-center"
                >
                    <p className="text-base font-bold text-foreground">
                        Desde $49.990/mes
                        <span className="ml-1.5 text-sm font-normal text-muted-foreground">(hasta 3 coaches)</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        +$9.990/mes por coach adicional · Precios + IVA · 30 días gratis · Sin tarjeta de crédito
                    </p>

                    <div className="mt-5 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                        <a
                            href={CALENDLY_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-amber-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        >
                            Agendar demo de 30 min
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                        <a
                            href={`mailto:${CONTACT_EMAIL}`}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            o escríbenos a {CONTACT_EMAIL}
                        </a>
                    </div>

                    <p className="mt-5 text-xs text-muted-foreground border-t border-border/40 pt-4">
                        Te acompañamos desde el primer día. Onboarding incluido.
                    </p>
                </motion.div>

            </div>
        </section>
    )
}
