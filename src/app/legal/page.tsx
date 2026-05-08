'use client'

import Link from 'next/link'
import { LandingBrandMark } from '@/components/landing/LandingBrandMark'
import { ArrowLeft } from 'lucide-react'

export default function AvisoLegalPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground overflow-x-hidden relative">
      {/* Background glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-[#007AFF]/10 blur-[100px] md:blur-[150px]" />
      </div>

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none z-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10">
        {/* Simple Header */}
        <header className="border-b border-white/5 bg-transparent py-6">
            <div className="max-w-4xl mx-auto px-6 flex items-center justify-between">
                <LandingBrandMark
                    className="transition-transform hover:scale-[1.02]"
                    iconClassName="h-8 w-8 sm:h-9 sm:w-9"
                />
                <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
            </div>
        </header>

        {/* Content */}
        <main className="py-20 px-6">
          <div className="max-w-3xl mx-auto space-y-12">
            <div>
              <span className="text-cyan-400 text-xs font-bold uppercase tracking-[0.2em] mb-4 block">
                Términos
              </span>
              <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight text-white mb-4">Aviso Legal</h1>
              <p className="text-zinc-400">Última actualización: {new Date().toLocaleDateString()}</p>
            </div>

            <div className="space-y-8 bg-white/[0.02] border border-white/5 backdrop-blur-xl rounded-[2rem] p-8 md:p-12 text-zinc-300">
              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">1. Información General</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  {`En cumplimiento con el deber de información dispuesto en la normativa vigente, se hace constar que esta aplicación web (en adelante, "la Plataforma") está diseñada para ser utilizada por entrenadores personales y sus clientes. `}
                  Los datos identificativos del responsable de la plataforma son:
                  <br /><br />
                  <strong>Nombre de la empresa / Titular:</strong> EVA
                  <br />
                  <strong>Correo electrónico de contacto:</strong> contacto@eva-app.cl
                  <br />
                  <strong>País/Jurisdicción:</strong> CHILE
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">2. Objeto</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  La Plataforma tiene como objetivo proporcionar herramientas para la gestión de clientes, creación de planes de entrenamiento y seguimiento nutricional. El acceso y uso de la Plataforma atribuye la condición de usuario y conlleva la aceptación plena de las presentes condiciones de uso.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">3. Uso de la Plataforma</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  El usuario se compromete a utilizar la Plataforma, los contenidos y servicios de conformidad con la Ley, la moral, las buenas costumbres y el orden público. Del mismo modo, el usuario se obliga a no utilizar la Plataforma con fines ilícitos o lesivos para los derechos e intereses de terceros.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">4. Propiedad Intelectual e Industrial</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  Todos los contenidos de la Plataforma, incluyendo a título enunciativo pero no limitativo, textos, fotografías, gráficos, imágenes, iconos, tecnología, software, así como su diseño gráfico y códigos fuente, constituyen una obra cuya propiedad pertenece al titular de la Plataforma, sin que puedan entenderse cedidos al usuario ninguno de los derechos de explotación sobre los mismos más allá de lo estrictamente necesario para el correcto uso de la Plataforma.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">5. Exclusión de Garantías y Responsabilidad</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  El titular de la Plataforma no se hace responsable, en ningún caso, de los daños y perjuicios de cualquier naturaleza que pudieran ocasionar errores u omisiones en los contenidos, falta de disponibilidad de la plataforma o la transmisión de virus o programas maliciosos, a pesar de haber adoptado todas las medidas tecnológicas necesarias para evitarlo. 
                  La información nutricional y de entrenamiento proporcionada a través de la plataforma tiene fines informativos y de gestión, y no debe sustituir el consejo de profesionales de la salud.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">6. Modificaciones</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  El titular de la Plataforma se reserva el derecho de efectuar sin previo aviso las modificaciones que considere oportunas en la Plataforma, pudiendo cambiar, suprimir o añadir tanto los contenidos y servicios que se presten a través de la misma como la forma en la que éstos aparezcan presentados o localizados.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">7. Suscripción y Cobros Recurrentes</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  EVA funciona con suscripciones para coaches. Los planes de 1-5, 6-10 y 11-30 alumnos
                  tienen cobro mensual. Los planes de 31-60 y hasta 500 alumnos operan con cobro trimestral
                  o anual. Al confirmar el pago, autorizas los cobros recurrentes correspondientes al ciclo
                  elegido hasta que canceles la suscripción.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">8. Cancelación y Reembolsos</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  Puedes cancelar la renovación de tu plan antes del próximo ciclo de facturación. La cancelación evita cobros futuros, pero no revierte automáticamente cobros ya procesados del periodo activo. Los reembolsos se evaluarán caso a caso ante errores de facturación comprobables.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">8.1 Gestión de plan</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  El coach puede solicitar cambio de tier (upgrade/downgrade) y cancelación desde el panel de
                  suscripción dentro de la app. Los cambios quedan sujetos a confirmación del proveedor de pagos y
                  disponibilidad técnica del ciclo de facturación vigente.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">9. Límites de Uso por Tier</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  Cada plan incluye un límite de alumnos y funciones habilitadas. El uso fuera de los límites del tier contratado puede requerir upgrade del plan para continuar operando sin restricciones.
                </p>
              </section>
            </div>
          </div>
        </main>
        
        {/* Footer */}
        <footer className="border-t border-white/5 bg-transparent py-12 mt-10">
            <div className="max-w-4xl mx-auto px-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <LandingBrandMark
                        className="opacity-90 hover:opacity-100"
                        iconClassName="h-8 w-8 sm:h-9 sm:w-9"
                    />

                    <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-muted-foreground">
                        <Link href="/legal" className="transition-colors hover:text-foreground">Aviso Legal</Link>
                        <Link href="/privacidad" className="transition-colors hover:text-foreground">Privacidad</Link>
                    </div>
                </div>
            </div>
        </footer>
      </div>
    </div>
  )
}
