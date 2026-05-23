import Link from 'next/link'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Contrato de Servicio Enterprise | EVA',
    description: 'Términos y condiciones del plan Enterprise de EVA para organizaciones.',
}

const LAST_UPDATED = '22 de mayo de 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">{title}</h2>
            <div className="text-muted-foreground text-sm leading-relaxed space-y-2">{children}</div>
        </section>
    )
}

export default function ContratoEnterprisePage() {
    return (
        <div className="min-h-dvh bg-background text-foreground overflow-x-hidden relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                <div className="absolute top-0 left-1/4 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-amber-500/10 blur-[100px] md:blur-[150px]" />
            </div>

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
                            <span className="text-amber-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">Contrato</span>
                            <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight text-foreground mb-4">
                                Contrato de Servicio Enterprise
                            </h1>
                            <p className="text-muted-foreground text-sm">
                                Última actualización: {LAST_UPDATED} · Versión 1.0
                            </p>
                        </div>

                        <div className="space-y-10 bg-card border border-border backdrop-blur-xl rounded-[2rem] p-8 md:p-12">

                            <Section title="1. Partes">
                                <p>
                                    Este contrato es entre <strong className="text-foreground">Juan Villegas</strong> (en adelante &quot;EVA&quot; o &quot;Proveedor&quot;),
                                    persona natural con domicilio en Chile, y la organización identificada al momento de la contratación
                                    (en adelante &quot;Cliente&quot; u &quot;Organización&quot;).
                                </p>
                            </Section>

                            <Section title="2. Servicio">
                                <p>
                                    EVA proveerá acceso al plan Enterprise de la plataforma EVA (eva-app.cl), que incluye:
                                </p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                    <li>Panel centralizado de administración de organización.</li>
                                    <li>Gestión de múltiples coaches y pool de alumnos compartido.</li>
                                    <li>Aislamiento completo de datos por organización mediante RLS.</li>
                                    <li>Soporte técnico por WhatsApp y correo electrónico.</li>
                                    <li>SLA de disponibilidad del 99% mensual (~7.3 h downtime permitido/mes).</li>
                                </ul>
                            </Section>

                            <Section title="3. Precio y facturación">
                                <p>
                                    <strong className="text-foreground">Plan base:</strong> $49.990 CLP/mes (incluye hasta 3 coaches).
                                    Coach adicional: $9.990 CLP/mes. Precios no incluyen IVA cuando corresponda.
                                </p>
                                <p>
                                    <strong className="text-foreground">Trial:</strong> 30 días gratuitos desde la activación.
                                    Sin tarjeta de crédito requerida durante el trial.
                                </p>
                                <p>
                                    <strong className="text-foreground">Facturación:</strong> mensual, el día 1 de cada mes.
                                    Activaciones posteriores al día 10 del mes cobran mes completo.
                                </p>
                                <p>
                                    <strong className="text-foreground">Pago:</strong> transferencia bancaria o link de pago MercadoPago
                                    enviado por EVA. Plazo máximo 5 días hábiles desde emisión de la factura.
                                </p>
                                <p>
                                    <strong className="text-foreground">Sin reembolso proporcional</strong> por días no utilizados
                                    en el mes activo. No hay reembolsos automáticos; se evalúan excepciones por errores de facturación.
                                </p>
                            </Section>

                            <Section title="4. Suspensión por mora">
                                <p>
                                    EVA suspenderá el acceso automáticamente si el pago no se recibe dentro de los 5 días hábiles
                                    posteriores al vencimiento. La suspensión no implica eliminación de datos. La reactivación
                                    opera dentro de las 24 horas hábiles de confirmado el pago.
                                </p>
                            </Section>

                            <Section title="5. Coaches — altas, bajas y cambios">
                                <p>
                                    El Cliente puede invitar y remover coaches desde el panel de administración.
                                    Al dar de baja un coach:
                                </p>
                                <ul className="list-disc list-inside space-y-1 ml-2">
                                    <li>Sus programas de entrenamiento y alumnos quedan bajo custodia de la organización.</li>
                                    <li>El org_admin puede reasignar los alumnos a otro coach.</li>
                                    <li>El cobro del coach removido cesa en el siguiente ciclo de facturación.</li>
                                </ul>
                            </Section>

                            <Section title="6. Datos y privacidad (DPA resumido)">
                                <p>
                                    <strong className="text-foreground">Roles:</strong> La Organización es responsable del tratamiento
                                    de los datos personales de sus alumnos y coaches. EVA actúa como encargado del tratamiento,
                                    procesando datos únicamente por instrucción del Cliente, conforme a la Ley 21.719.
                                </p>
                                <p>
                                    <strong className="text-foreground">Aislamiento:</strong> Los datos de cada organización son
                                    accesibles exclusivamente por sus miembros. El aislamiento se implementa mediante
                                    Row-Level Security (RLS) en PostgreSQL y controles JWT. EVA no accede a datos
                                    de producción del Cliente salvo solicitud expresa para soporte técnico.
                                </p>
                                <p>
                                    <strong className="text-foreground">Retención:</strong> Al terminar el contrato, los datos
                                    se conservan 90 días para facilitar migración y luego se eliminan de forma segura.
                                    Los registros de auditoría y contables se retienen por obligación legal (6 años).
                                </p>
                                <p>
                                    <strong className="text-foreground">Subprocesadores:</strong> Supabase Inc. (base de datos, AWS us-east-1),
                                    Vercel Inc. (hosting), Resend Inc. (correo). Listado completo en la{' '}
                                    <Link href="/privacidad" className="text-amber-400 hover:underline">política de privacidad</Link>.
                                </p>
                                <p>
                                    <strong className="text-foreground">Incidentes:</strong> EVA notificará al Cliente dentro de las
                                    72 horas de tomar conocimiento de una brecha de seguridad que afecte sus datos.
                                </p>
                            </Section>

                            <Section title="7. Propiedad intelectual">
                                <p>
                                    La plataforma EVA y su código fuente son propiedad del Proveedor. El Cliente retiene
                                    la propiedad de los datos de sus alumnos y de los contenidos que suba a la plataforma
                                    (programas, planes nutricionales, logos).
                                </p>
                            </Section>

                            <Section title="8. Limitación de responsabilidad">
                                <p>
                                    EVA no será responsable por daños indirectos, lucro cesante ni pérdida de datos
                                    derivada de fuerza mayor, fallo de terceros (Supabase, Vercel, MercadoPago) o uso
                                    incorrecto de la plataforma. La responsabilidad máxima de EVA se limita al monto
                                    pagado por el Cliente en los últimos 3 meses.
                                </p>
                            </Section>

                            <Section title="9. Terminación">
                                <p>
                                    Cualquiera de las partes puede terminar el contrato con 15 días de aviso previo
                                    por escrito (correo electrónico). El Cliente puede desactivar su organización
                                    desde el panel en cualquier momento. No hay penalidades por terminación anticipada.
                                </p>
                            </Section>

                            <Section title="10. Modificaciones">
                                <p>
                                    EVA notificará cambios materiales en el contrato con al menos 30 días de anticipación
                                    por correo electrónico. El uso continuado del servicio implica aceptación de los cambios.
                                </p>
                            </Section>

                            <Section title="11. Ley aplicable">
                                <p>
                                    Este contrato se rige por la legislación de la República de Chile.
                                    Cualquier disputa se someterá a los tribunales ordinarios de justicia de Santiago de Chile.
                                </p>
                            </Section>

                            <div className="border-t border-border pt-6 space-y-2">
                                <p className="text-xs text-muted-foreground">
                                    Al activar el plan Enterprise o hacer uso del servicio, la Organización acepta los términos de este contrato.
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Contacto:{' '}
                                    <a href="mailto:contacto@eva-app.cl" className="text-amber-400 hover:underline">contacto@eva-app.cl</a>
                                </p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
