'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles, X } from 'lucide-react'

const DISMISS_KEY = 'eva:nutrition-v2-banner-dismissed'

/**
 * Banner discreto (solo alumnos con el gate webStudent ON) que ofrece probar la nueva
 * experiencia de nutrición V2. El swap del alumno NO es automático — V1 conserva features que
 * V2 aún no cubre — así que esto es una invitación opcional.
 *
 * Dismissible client-side (localStorage, persiste el descarte). Progressive enhancement: no
 * renderiza en SSR (visible arranca en false y se resuelve en el efecto) para evitar flash del
 * banner ya descartado. Tokens de marca (`--theme-primary`) → respeta white-label y dark mode.
 */
export function NutritionV2Banner({ href }: { href: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) !== '1') setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [])

  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* almacenamiento no disponible: descarte solo en memoria */
    }
  }

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-3"
      style={{ borderColor: 'color-mix(in srgb, var(--theme-primary) 30%, transparent)' }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
        style={{ backgroundColor: 'var(--theme-primary)' }}
      >
        <Sparkles className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-tight text-foreground">
          Prueba la nueva experiencia de nutrición
        </p>
        <Link
          href={href}
          className="mt-0.5 inline-block text-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: 'var(--theme-primary)' }}
        >
          Abrir la versión nueva
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Descartar aviso"
        className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
