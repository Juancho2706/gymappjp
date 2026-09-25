import Link from 'next/link'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Política de Privacidad',
    description: 'Política de privacidad de EVA: qué datos personales tratamos, con qué base y finalidad, subprocesadores, plazos de retención y cómo ejercer tus derechos, conforme a la normativa chilena de protección de datos.',
    alternates: { canonical: '/privacidad' },
}

const LAST_UPDATED = '25 de septiembre de 2026'
const CONTACT_EMAIL = 'privacidad@eva-app.cl'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            <div className="text-muted-foreground text-sm leading-relaxed space-y-2">{children}</div>
        </section>
    )
}

export default function PrivacidadPage() {
    return (
        <div className="min-h-dvh bg-background text-foreground overflow-x-hidden relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-0 left-1/4 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-[#007AFF]/10 blur-[100px] md:blur-[150px]" />
            </div>
            <div
                className="absolute inset-0 opacity-[0.02] pointer-events-none z-0"
                style={{
                    backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
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
                            <span className="text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">Privacidad</span>
                            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight text-foreground mb-4">
                                Política de Privacidad
                            </h1>
                            <p className="text-muted-foreground text-sm">
                                Última actualización: {LAST_UPDATED} · Conforme a la Ley 21.719 (Chile)
                            </p>
                        </div>

                        <div className="space-y-10 bg-card border border-border backdrop-blur-xl rounded-[2rem] p-8 md:p-12">

                            <Section title="1. Responsable del tratamiento">
                                <p>
                                    <strong className="text-foreground">Juan Villegas</strong>, persona natural con domicilio en Chile,
                                    es el responsable del tratamiento de los datos personales recopilados a través de{' '}
                                    <strong className="text-foreground">EVA</strong> (eva-app.cl).
                                </p>
                                <p>
                                    Consultas y ejercicio de derechos ARCO:{' '}
                                    <a href={`mailto:${CONTACT_EMAIL}`} className="text-cyan-400 hover:underline">{CONTACT_EMAIL}</a>
                                </p>
                            </Section>

                            <Section title="2. Datos que recopilamos">
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li><strong className="text-foreground">Identificación:</strong> nombre completo, correo electrónico, contraseña (hash bcrypt).</li>
                                    <li><strong className="text-foreground">Marca:</strong> nombre de marca, slug de URL, logo, colores personalizados.</li>
                                    <li><strong className="text-foreground">Datos de salud (categoría sensible — Art. 16 Ley 21.719):</strong> registros de entrenamiento, métricas corporales, check-ins de bienestar, planes de nutrición y logs de alimentación de los alumnos del coach.</li>
                                    <li><strong className="text-foreground">Pago:</strong> historial de transacciones procesado por MercadoPago o Flow. EVA no almacena datos de tarjetas.</li>
                                    <li><strong className="text-foreground">Uso:</strong> eventos de sesión y navegación para análisis anonimizado del producto.</li>
                                    <li><strong className="text-foreground">Diagnóstico:</strong> informes de errores y cierres inesperados de la web y la app (modelo y sistema del dispositivo, versión de la app y detalle técnico del error).</li>
                                    <li><strong className="text-foreground">Identificadores publicitarios y eventos de la app:</strong> en la app móvil, el identificador de publicidad del dispositivo (Android) o el IDFA si lo autorizas (iOS), junto con la instalación, cada apertura de la app y el alta de una cuenta de coach. Se usan solo para medir anuncios (ver sección 9).</li>
                                </ul>
                            </Section>

                            <Section title="3. Base legal del tratamiento">
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li><strong className="text-foreground">Ejecución del contrato:</strong> datos necesarios para prestar el servicio (Art. 13 Ley 21.719).</li>
                                    <li><strong className="text-foreground">Consentimiento explícito:</strong> datos de salud de los alumnos (Art. 16 Ley 21.719) — otorgado al momento del registro.</li>
                                    <li><strong className="text-foreground">Consentimiento opcional:</strong> envío de comunicaciones de marketing; cookies analíticas y píxel de Meta en la web; permiso de seguimiento en iPhone.</li>
                                    <li><strong className="text-foreground">Interés legítimo, con derecho de oposición:</strong> diagnóstico de errores y medición de anuncios en la app de Android (puedes desactivarla como se indica en la sección 9).</li>
                                    <li><strong className="text-foreground">Obligación legal:</strong> retención de registros contables conforme a la Ley SII (mínimo 6 años).</li>
                                </ul>
                            </Section>

                            <Section title="4. Finalidades del tratamiento">
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li>Proveer y mantener la plataforma EVA.</li>
                                    <li>Gestionar la relación coach–alumno dentro del servicio.</li>
                                    <li>Procesar pagos y gestionar suscripciones.</li>
                                    <li>Enviar comunicaciones transaccionales del servicio (bienvenida, límites, facturación).</li>
                                    <li>Enviar comunicaciones de marketing si el usuario otorgó consentimiento explícito.</li>
                                    <li>Mejorar el producto mediante análisis agregado y anonimizado de uso.</li>
                                    <li>Detectar y corregir errores de la plataforma.</li>
                                    <li>Medir la efectividad de nuestros anuncios: saber qué campaña trajo una instalación de la app o el alta de un coach.</li>
                                </ul>
                            </Section>

                            <Section title="5. Subprocesadores y terceros">
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li><strong className="text-foreground">Supabase Inc.</strong> — base de datos y autenticación. AWS us-east-1, EE.UU.</li>
                                    <li><strong className="text-foreground">Vercel Inc.</strong> — hosting de la aplicación. EE.UU. y UE.</li>
                                    <li><strong className="text-foreground">MercadoPago S.A.</strong> — procesamiento de pagos. Argentina y región.</li>
                                    <li><strong className="text-foreground">Flow</strong> (flow.cl) — procesamiento de pagos. Chile.</li>
                                    <li><strong className="text-foreground">Resend Inc.</strong> — correos transaccionales. EE.UU.</li>
                                    <li><strong className="text-foreground">PostHog Inc.</strong> — analítica anonimizada. EE.UU.</li>
                                    <li><strong className="text-foreground">Functional Software, Inc. (Sentry)</strong> — registro de errores de la web y la app. EE.UU.</li>
                                    <li><strong className="text-foreground">Google LLC</strong> — inicio de sesión con Google, solo si eliges ese método. EE.UU.</li>
                                    <li><strong className="text-foreground">Meta Platforms, Inc.</strong> — medición de anuncios (píxel en la web, SDK en la app y envío de servidor a servidor al registrarse un coach). Meta recibe estos datos como tercero y los trata también según sus propias políticas. EE.UU. e Irlanda.</li>
                                </ul>
                                <p>
                                    Las transferencias internacionales se realizan con garantías adecuadas mediante cláusulas contractuales estándar.
                                </p>
                            </Section>

                            <Section title="6. Plazos de retención">
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li><strong className="text-foreground">Datos de cuenta activa:</strong> durante toda la vigencia del contrato.</li>
                                    <li><strong className="text-foreground">Datos de salud (alumnos):</strong> durante la relación coach–alumno + 1 año.</li>
                                    <li><strong className="text-foreground">Registros contables y de pago:</strong> 6 años (obligación SII).</li>
                                    <li><strong className="text-foreground">Logs de auditoría de eliminación:</strong> 6 años.</li>
                                    <li><strong className="text-foreground">Datos de marketing:</strong> hasta retiro del consentimiento.</li>
                                </ul>
                            </Section>

                            <Section title="7. Derechos ARCO+ (Art. 5–12 Ley 21.719)">
                                <p>Tienes derecho a:</p>
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li><strong className="text-foreground">Acceso:</strong> conocer qué datos tenemos sobre ti.</li>
                                    <li><strong className="text-foreground">Rectificación:</strong> corregir datos inexactos.</li>
                                    <li><strong className="text-foreground">Cancelación / Supresión:</strong> eliminar tu cuenta y datos asociados.</li>
                                    <li><strong className="text-foreground">Oposición:</strong> oponerte al tratamiento para fines de marketing.</li>
                                    <li><strong className="text-foreground">Portabilidad:</strong> recibir tus datos en formato estructurado.</li>
                                    <li><strong className="text-foreground">Revocación:</strong> retirar cualquier consentimiento en cualquier momento.</li>
                                </ul>
                                <p>
                                    Ejercicio de derechos:{' '}
                                    <a href="mailto:privacidad@eva-app.cl" className="text-cyan-400 hover:underline">privacidad@eva-app.cl</a>.
                                    Respondemos en máximo 30 días hábiles.
                                </p>
                                <p>
                                    También puedes reclamar ante la <strong className="text-foreground">Agencia de Protección de Datos Personales de Chile</strong>.
                                </p>
                            </Section>

                            <Section title="8. Eliminación de cuenta">
                                <p>
                                    Puedes eliminar tu cuenta desde{' '}
                                    <strong className="text-foreground">Configuración → Zona de peligro → Eliminar cuenta</strong>.
                                    Al eliminar:
                                </p>
                                <ul className="list-disc list-inside space-y-1.5 ml-2">
                                    <li>Los datos personales de tus alumnos serán anonimizados (nombre, email, teléfono).</li>
                                    <li>Los registros de entrenamiento y nutrición serán eliminados.</li>
                                    <li>Tu suscripción activa será cancelada en la pasarela donde la contrataste (MercadoPago o Flow).</li>
                                    <li>Serás eliminado de todas las listas de email de marketing.</li>
                                    <li>Los registros contables se conservarán anonimizados por obligación legal (6 años).</li>
                                </ul>
                            </Section>

                            <Section title="9. Cookies, analítica y medición de anuncios">
                                <p>
                                    EVA utiliza cookies de sesión estrictamente necesarias para la autenticación.
                                    La analítica de producto se realiza con datos anonimizados mediante PostHog,
                                    configurado sin perfiles identificados por defecto (conforme a Ley 21.719, Art. 4).
                                </p>
                                <p>
                                    <strong className="text-foreground">Web:</strong> solo si aceptas las cookies analíticas en el aviso de cookies,
                                    cargamos el píxel de Meta, que mide visitas y registros en las páginas públicas de EVA. Nunca se
                                    activa en las páginas de los alumnos de un coach. Puedes rechazarlo en ese mismo aviso.
                                </p>
                                <p>
                                    <strong className="text-foreground">Registro de coach en la web:</strong> al crear la cuenta, EVA envía a Meta,
                                    de servidor a servidor, el evento de registro con tu correo y un identificador interno cifrados
                                    (hash SHA-256), tu dirección IP y tu navegador, para atribuir el registro a la campaña que te trajo.
                                </p>
                                <p>
                                    <strong className="text-foreground">App móvil:</strong> el SDK de Meta registra la instalación, cada apertura
                                    de la app y el alta de una cuenta de coach, junto con el identificador de publicidad del dispositivo
                                    (Android) o el IDFA solo si aceptas el permiso de seguimiento (iOS). No envía datos de salud,
                                    entrenamiento ni nutrición, ni tu nombre o correo. Para desactivarlo: en Android, Ajustes → Google →
                                    Anuncios → «Borrar ID de publicidad»; en iPhone, Ajustes → Privacidad y seguridad → Rastreo.
                                </p>
                            </Section>

                            <Section title="10. Menores de edad">
                                <p>
                                    EVA no está destinado a usuarios menores de 14 años. Al registrar un alumno menor de 14 años,
                                    el coach confirma explícitamente que cuenta con el consentimiento de su tutor legal,
                                    conforme al artículo correspondiente de la <strong className="text-foreground">Ley 21.719</strong>.
                                    EVA registra esta confirmación con marca de tiempo (<code>age_confirmed_at</code>).
                                </p>
                                <p>
                                    Si detectamos datos de menores ingresados sin consentimiento, los eliminaremos de inmediato.
                                    Notificar a <a href="mailto:privacidad@eva-app.cl" className="text-cyan-400 hover:underline">privacidad@eva-app.cl</a>.
                                </p>
                            </Section>

                            <Section title="11. Organizaciones y equipos con contrato empresarial">
                                <p>
                                    Las organizaciones que contratan un plan empresarial a medida actúan como{' '}
                                    <strong className="text-foreground">responsables del tratamiento</strong> de los datos personales
                                    de sus alumnos y coaches. EVA actúa como <strong className="text-foreground">encargado del tratamiento</strong>,
                                    procesando datos únicamente por instrucción de la organización.
                                </p>
                                <p>
                                    Cada organización accede exclusivamente a sus propios datos — el aislamiento se implementa
                                    mediante Row-Level Security en base de datos y controles en JWT. Ninguna organización
                                    puede ver datos de otra.
                                </p>
                                <p>
                                    El contrato firmado con cada organización incluye un Acuerdo de Procesamiento
                                    de Datos (DPA) que formaliza estos roles y obligaciones conforme a la Ley 21.719.
                                </p>
                            </Section>

                            <Section title="12. Cambios a esta política">
                                <p>
                                    Notificaremos cambios materiales por correo electrónico con al menos 15 días de anticipación.
                                    El uso continuado del servicio tras la notificación implica aceptación de los cambios.
                                </p>
                            </Section>
                        </div>

                        <p className="text-center text-xs text-muted-foreground">
                            ¿Preguntas?{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`} className="text-cyan-400 hover:underline">{CONTACT_EMAIL}</a>
                        </p>
                    </div>
                </main>
            </div>
        </div>
    )
}
