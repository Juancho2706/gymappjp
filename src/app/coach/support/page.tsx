import { Metadata } from 'next'
import { SupportForm } from './SupportForm'
import { LifeBuoy } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Centro de Ayuda | EVA',
}

export default function CoachSupportPage() {
  return (
    <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto animate-fade-in">
      <div className="mb-6 space-y-2">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-6 w-6 text-primary" />
          <h1 className="text-xl md:text-2xl font-extrabold text-foreground leading-tight">
            Centro de Ayuda
          </h1>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          ¿Tienes dudas, encontraste un problema o quieres sugerir una mejora? 
          Escríbenos y te responderemos directamente a tu correo.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 md:p-6">
        <SupportForm />
      </div>
    </div>
  )
}
