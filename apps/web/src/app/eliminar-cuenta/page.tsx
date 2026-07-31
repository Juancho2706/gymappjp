import Link from 'next/link'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { ArrowLeft, ShieldCheck, Trash2, Mail, Smartphone, Clock } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Eliminar tu cuenta',
    description:
        'Cómo eliminar tu cuenta de EVA y todos tus datos asociados: pasos para coaches y alumnos, qué datos se borran, qué se retiene por obligación legal y en qué plazos.',
    alternates: { canonical: '/eliminar-cuenta' },
}

const LAST_UPDATED = '30 de julio de 2026'
const CONTACT_EMAIL = 'privacidad@eva-app.cl'
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Solicitud de eliminación de cuenta EVA')}&body=${encodeURIComponent(
    'Solicito la eliminación definitiva de mi cuenta de EVA y de todos mis datos asociados.\n\nEnvío este correo desde la misma dirección con la que está registrada mi cuenta.'
)}`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            <div className="text-muted-foreground text-sm leading-relaxed space-y-2">{children}</div>
        </section>
    )
}

/* Paso numerado: la numeración es una secuencia real que el titular sigue en orden. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
    return (
        <li className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-400 text-xs font-bold">
                {n}
            </span>
            <span>{children}</span>
        </li>
    )
}

export default function EliminarCuentaPage() {
    return (
        <div className="min-h-dvh bg-background text-foreground overflow-x-hidden relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-0 left-1/4 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-[#007AFF]/10 blur-[100px] md:blur-[150px]" />
            </div>
            <div
                className="absolute inset-0 opacity-[0.02] pointer-events-none z-0"
                style={{
                    backgroundImage:
                        'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                }}
            />

            <div className="relative z-10">
                <header className="border-b border-border bg-transparent py-6">
                    <div className="max-w-4xl mx-auto px-6 flex items-center justify-between">
                        <LandingBrandMark className="transition-transform hover:scale-[1.02]" iconClassName="h-8 w-8 sm:h-9 sm:w-9" />
                        <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                            <ArrowLeft className="w-4 h-4" />
                            Volver
                        </Link>
                    </div>
                </header>

                <main className="py-20 px-6">
                    <div className="max-w-3xl mx-auto space-y-12">
                        <div>
                            <span className="text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">Tu cuenta, tu decisión</span>
                            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight text-foreground mb-4">
                                Eliminar tu cuenta de EVA
                            </h1>
                            <p className="text-muted-foreground text-sm">
                                Última actualización: {LAST_UPDATED} · Aplica a la app EVA (Google Play y App Store) y a eva-app.cl
                            </p>
                        </div>

                        {/* Garantía de seguridad: nadie más que el titular puede iniciar el borrado. */}
                        <div className="flex items-start gap-4 bg-card border border-border backdrop-blur-xl rounded-2xl p-5">
                            <ShieldCheck className="w-6 h-6 shrink-0 text-cyan-400 mt-0.5" />
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                <strong className="text-foreground">Solo la persona titular puede eliminar su cuenta.</strong>{' '}
                                El borrado se inicia únicamente con la sesión iniciada dentro de EVA, o mediante un correo enviado{' '}
                                <strong className="text-foreground">desde la misma dirección registrada en la cuenta</strong>. Nunca
                                eliminamos una cuenta a pedido de terceros, y toda solicitud por correo se confirma respondiendo a esa
                                misma dirección antes de ejecutar el borrado.
                            </p>
                        </div>

                        <div className="space-y-10 bg-card border border-border backdrop-blur-xl rounded-[2rem] p-8 md:p-12">
                            <Section title="Si eres coach">
                                <ol className="space-y-3 list-none">
                                    <Step n={1}>
                                        Inicia sesión en <strong className="text-foreground">eva-app.cl</strong> con tu cuenta de coach.
                                    </Step>
                                    <Step n={2}>
                                        Ve a <strong className="text-foreground">Ajustes → Eliminar cuenta</strong>.
                                    </Step>
                                    <Step n={3}>
                                        Confirma la acción. Es <strong className="text-foreground">definitiva e irreversible</strong>: se
                                        elimina tu cuenta, tu marca y los datos de tus alumnos gestionados en EVA.
                                    </Step>
                                </ol>
                            </Section>

                            <Section title="Si eres alumno o alumna">
                                <ol className="space-y-3 list-none">
                                    <Step n={1}>
                                        Pídele la eliminación a tu coach: puede borrar tu cuenta al instante desde su panel
                                        (Alumnos → tu ficha → Eliminar definitivamente).
                                    </Step>
                                    <Step n={2}>
                                        O escríbenos directamente a{' '}
                                        <a href={MAILTO} className="text-cyan-400 hover:underline">{CONTACT_EMAIL}</a>{' '}
                                        <strong className="text-foreground">desde el correo con el que entras a EVA</strong>, con el
                                        asunto “Solicitud de eliminación de cuenta”.
                                    </Step>
                                    <Step n={3}>
                                        Te confirmaremos la identidad respondiendo a ese mismo correo y ejecutaremos el borrado en un
                                        plazo máximo de <strong className="text-foreground">30 días</strong> (normalmente en 72 horas).
                                    </Step>
                                </ol>
                            </Section>

                            <Section title="Qué se elimina">
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li>Tu cuenta de acceso, nombre y correo electrónico.</li>
                                    <li>
                                        Todos tus <strong className="text-foreground">datos de salud y entrenamiento</strong>: registros de
                                        sesiones, planes, nutrición y comidas, hábitos (agua, pasos, sueño), check-ins y mediciones corporales.
                                    </li>
                                    <li>Tus fotos de progreso y de check-in (se borran también del almacenamiento).</li>
                                    <li>Notas y comentarios intercambiados con tu coach.</li>
                                    <li>En cuentas de coach: además la marca personalizada (logo, colores) y la configuración del panel.</li>
                                </ul>
                                <p>
                                    El borrado es <strong className="text-foreground">permanente</strong>: no mantenemos copias
                                    recuperables de estos datos una vez procesada la eliminación.
                                </p>
                            </Section>

                            <Section title="Qué se retiene y por cuánto tiempo">
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li>
                                        <strong className="text-foreground">Comprobantes de pago y registros contables</strong> de
                                        suscripciones: hasta <strong className="text-foreground">6 años</strong>, por obligación tributaria
                                        chilena (Ley SII). No incluyen tus datos de salud ni tus fotos.
                                    </li>
                                    <li>
                                        <strong className="text-foreground">Registros técnicos mínimos de seguridad</strong> (por ejemplo,
                                        constancia de la solicitud de borrado): hasta 12 meses, solo para auditoría y prevención de abuso.
                                    </li>
                                </ul>
                                <p>
                                    Todo lo demás se elimina según lo descrito arriba. Más detalle en nuestra{' '}
                                    <Link href="/privacidad" className="text-cyan-400 hover:underline">Política de Privacidad</Link>.
                                </p>
                            </Section>

                            <div className="grid gap-3 sm:grid-cols-2 pt-2">
                                <a
                                    href="https://www.eva-app.cl/login"
                                    className="flex items-center justify-center gap-2 rounded-xl bg-cyan-400/10 border border-cyan-400/30 px-5 py-3.5 text-sm font-bold text-cyan-400 transition-colors hover:bg-cyan-400/20"
                                >
                                    <Smartphone className="w-4 h-4" />
                                    Entrar y eliminar desde Ajustes
                                </a>
                                <a
                                    href={MAILTO}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-red-500/10 border border-red-500/30 px-5 py-3.5 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/20"
                                >
                                    <Mail className="w-4 h-4" />
                                    Solicitar borrado por correo
                                </a>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border pt-6 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5"><Trash2 className="w-3.5 h-3.5" /> Borrado definitivo e irreversible</span>
                                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Plazo máximo: 30 días</span>
                                <span className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Solo el titular puede solicitarlo</span>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
