'use client'

import Link from 'next/link'
import { GymAppLogo } from '@/components/ui/Logo'
import { ArrowLeft } from 'lucide-react'

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden relative">
      {/* Background glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-1/4 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full bg-[#00E5FF]/10 blur-[100px] md:blur-[150px]" />
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
                <Link href="/" className="flex items-center gap-2 group">
                    <GymAppLogo className="h-8 w-[4.25rem] flex-shrink-0 transition-transform group-hover:scale-105" />
                    <span className="text-white font-bold text-sm tracking-tight font-display">EVA</span>
                </Link>
                <Link href="/" className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors">
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
                Privacidad
              </span>
              <h1 className="text-4xl md:text-5xl font-black font-display tracking-tight text-white mb-4">Política de Privacidad</h1>
              <p className="text-zinc-400">Última actualización: {new Date().toLocaleDateString()}</p>
            </div>

            <div className="space-y-8 bg-white/[0.02] border border-white/5 backdrop-blur-xl rounded-[2rem] p-8 md:p-12 text-zinc-300">
              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">1. Identidad del Responsable de los Datos</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  {`Los datos personales recopilados a través de esta plataforma (la "Plataforma") serán incorporados y tratados bajo la responsabilidad del titular de la Plataforma. `}
                  <br /><br />
                  <strong>Nombre:</strong> EVA
                  <br />
                  <strong>Contacto:</strong> opcoach49@gmail.com
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">2. Datos Recopilados</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  La Plataforma recopila datos personales necesarios para el funcionamiento de los servicios, incluyendo:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm md:text-base ml-2 text-zinc-400">
                  <li><strong>Datos de Identificación y Contacto:</strong> Nombre, apellidos, correo electrónico y contraseña (encriptada).</li>
                  <li><strong>Datos de Uso y Perfilamiento:</strong> Datos relacionados a los entrenamientos, medidas antropométricas, macronutrientes, alergias y preferencias de dieta.</li>
                  <li><strong>Datos de Navegación:</strong> Direcciones IP, cookies y datos de sesión en la plataforma.</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">3. Finalidad del Tratamiento de los Datos</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  El tratamiento de sus datos personales tiene como finalidades:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm md:text-base ml-2 text-zinc-400">
                  <li>Proporcionar, operar, mantener y mejorar los servicios de entrenamiento y nutrición ofrecidos.</li>
                  <li>Permitir la gestión de clientes por parte de los entrenadores (creación de rutinas, planes de nutrición, check-ins).</li>
                  <li>Enviar comunicaciones operativas relacionadas con la cuenta o cambios en los servicios.</li>
                  <li>Garantizar la seguridad de la Plataforma, detectar y prevenir fraudes.</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">4. Base Legitimadora del Tratamiento</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  La base legal para el tratamiento de los datos es el consentimiento expreso otorgado por el usuario al registrarse en la Plataforma, así como la ejecución de un contrato o términos de servicio acordados.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">5. Conservación de los Datos</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  Los datos personales se conservarán mientras exista una relación contractual y/o comercial con el usuario, o hasta que este solicite la supresión de los mismos. Una vez finalizada la relación, los datos podrán conservarse bloqueados durante los plazos legales aplicables para atender posibles responsabilidades.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">6. Comunicación a Terceros</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  Los datos personales no serán vendidos a terceros. Pueden ser comunicados a proveedores de servicios de infraestructura tecnológica (por ejemplo, Supabase para base de datos y autenticación, Vercel para hosting) que actúan como encargados del tratamiento bajo estrictas políticas de confidencialidad.
                </p>
              </section>

              <section className="space-y-4">
                <h2 className="text-2xl font-bold text-white">7. Derechos de los Usuarios</h2>
                <p className="leading-relaxed text-sm md:text-base">
                  El usuario tiene derecho a:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm md:text-base ml-2 text-zinc-400">
                  <li>Acceder a sus datos personales.</li>
                  <li>Solicitar la rectificación de los datos inexactos.</li>
                  <li>Solicitar la supresión o borrado (derecho al olvido).</li>
                  <li>Solicitar la limitación del tratamiento.</li>
                  <li>Oponerse al tratamiento y solicitar la portabilidad de los datos.</li>
                </ul>
                <p className="leading-relaxed text-sm md:text-base mt-4 text-zinc-400">
                  Para ejercer estos derechos, el usuario puede enviar una solicitud por escrito al correo de contacto especificado en la sección 1, adjuntando una prueba de identidad válida.
                </p>
              </section>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-white/5 bg-transparent py-12 mt-10">
            <div className="max-w-4xl mx-auto px-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                        <GymAppLogo className="h-8 w-[4.25rem] flex-shrink-0" />
                        <span className="text-white font-bold text-sm tracking-tight font-display">EVA</span>
                    </div>

                    <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-zinc-400">
                        <Link href="/legal" className="hover:text-white transition-colors">Aviso Legal</Link>
                        <Link href="/privacidad" className="hover:text-white transition-colors">Privacidad</Link>
                    </div>
                </div>
            </div>
        </footer>
      </div>
    </div>
  )
}
