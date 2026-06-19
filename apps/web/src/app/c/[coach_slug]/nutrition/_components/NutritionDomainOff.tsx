import Link from 'next/link'
import { ArrowLeft, Salad } from 'lucide-react'
import { getClientBasePath } from '@/lib/client/base-path'

/**
 * Estado "Nutricion no disponible": el coach apago el dominio Nutricion por preferencia
 * (`resolveNutritionDomainEnabled === false`, §4.8). Se oculta TODO el contenido del
 * dominio — NUNCA se borra data, solo no se renderiza. Distinto de "sin plan": aca el
 * coach decidio no usar la superficie de nutricion para este alumno/team.
 */
export async function NutritionDomainOff({ coachSlug }: { coachSlug: string }) {
  const base = await getClientBasePath(coachSlug)
  return (
    <div className="min-h-dvh bg-background">
      <div
        className="fixed top-0 right-0 w-72 h-72 opacity-[0.06] blur-3xl rounded-full pointer-events-none"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      />

      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/10 px-4 py-3.5 pt-safe flex items-center gap-3">
        <Link
          href={`${base}/dashboard`}
          className="w-9 h-9 flex items-center justify-center -ml-1 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-black tracking-tight text-foreground">Nutrición</h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-16 flex flex-col items-center text-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
          <Salad className="h-7 w-7 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-foreground">Nutrición no disponible</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Tu coach no tiene activada la sección de nutrición por ahora. Si crees que debería estar
            disponible, escríbele directamente.
          </p>
        </div>
        <Link
          href={`${base}/dashboard`}
          className="mt-2 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Volver al inicio
        </Link>
      </main>
    </div>
  )
}
