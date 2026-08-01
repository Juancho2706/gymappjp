import Link from 'next/link'
import { ArrowLeft, Salad } from 'lucide-react'
import { getClientBasePath } from '@/lib/client/base-path'

/** Estado neutral de una ruta V2 cuando el dominio de nutrición está deshabilitado. */
export async function NutritionDomainOff({ coachSlug }: { coachSlug: string }) {
  const base = await getClientBasePath(coachSlug)

  return (
    <div className="min-h-dvh bg-background">
      <div
        className="pointer-events-none fixed top-0 right-0 h-72 w-72 rounded-full opacity-[0.06] blur-3xl"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      />

      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border/10 bg-background/80 px-4 py-3.5 pt-safe backdrop-blur-xl">
        <Link
          href={`${base}/dashboard`}
          className="-ml-1 flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-black tracking-tight text-foreground">Nutrición</h1>
      </header>

      <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/40">
          <Salad className="h-7 w-7 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-bold text-foreground">Nutrición no disponible</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
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
