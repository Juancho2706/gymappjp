import { Metadata } from 'next'
import { SupportForm } from './SupportForm'
import { LifeBuoy } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Centro de Ayuda | EVA',
}

export default function CoachSupportPage() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-in px-4 py-6 md:px-8">
      {/* Inverse hero */}
      <div className="mb-5 flex items-center gap-3.5 rounded-card p-5 bg-[var(--surface-inverse)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control bg-[var(--sport-500)] text-[var(--text-on-sport)]">
          <LifeBuoy className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-black text-on-dark md:text-2xl">
            Centro de Ayuda
          </h1>
          <p className="mt-0.5 text-[13px] leading-relaxed text-on-dark-muted">
            Escríbenos: dudas, un problema o una mejora. Te respondemos directamente a tu correo.
          </p>
        </div>
      </div>

      <div className="rounded-card border border-subtle bg-surface-card p-5 md:p-6">
        <SupportForm />
      </div>
    </div>
  )
}
