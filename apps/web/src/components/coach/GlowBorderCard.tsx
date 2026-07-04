'use client'

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * GlowBorderCard — marco animado sobrio para el hero de la ficha de alumno.
 *
 * Técnica: un anillo (`.gbc-ring`) absoluto sobre el borde de la Card con un
 * conic-gradient que rota vía la custom property registrada `--gbc-angle`
 * (@property). Dos destellos recorren el perímetro en color de MARCA del coach
 * (`--theme-primary-rgb`) — nada de arcoíris, respeta white-label.
 *
 * GOTCHA del repo: `--theme-primary-rgb` es una lista con COMAS ("r, g, b"),
 * por eso SIEMPRE se consume como `rgba(var(--theme-primary-rgb), a)`.
 * `rgb(var(--x) / a)` sería CSS inválido y moriría en silencio.
 *
 * Fallbacks: navegadores sin @property no interpolan `--gbc-angle` (queda un
 * borde gradiente estático — aceptable). `prefers-reduced-motion` apaga la
 * animación. Sin JS de animación; el estilo se inyecta UNA vez en <head>.
 */

const STYLE_ID = 'gbc-glow-border-styles'

const GBC_CSS = `
@property --gbc-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes gbc-spin {
  to { --gbc-angle: 360deg; }
}
.gbc-ring {
  /* Fallback para navegadores sin @property: gradiente estático (no anima). */
  --gbc-angle: 0deg;
  padding: 1.5px;
  border-radius: inherit;
  /* Light: alfas suaves para que el efecto se lea elegante en claro. */
  background: conic-gradient(
    from var(--gbc-angle),
    transparent 0%,
    rgba(var(--theme-primary-rgb), 0.5) 12%,
    transparent 30%,
    transparent 55%,
    rgba(var(--theme-primary-rgb), 0.3) 70%,
    transparent 85%
  );
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  animation: gbc-spin 8s linear infinite;
}
.dark .gbc-ring {
  background: conic-gradient(
    from var(--gbc-angle),
    transparent 0%,
    rgba(var(--theme-primary-rgb), 0.8) 12%,
    transparent 30%,
    transparent 55%,
    rgba(var(--theme-primary-rgb), 0.5) 70%,
    transparent 85%
  );
}
/* Glow exterior sutil (más marcado en dark, tenue en claro). */
.gbc-wrap {
  box-shadow: 0 0 18px rgba(var(--theme-primary-rgb), 0.08);
}
.dark .gbc-wrap {
  box-shadow: 0 0 24px rgba(var(--theme-primary-rgb), 0.15);
}
@media (prefers-reduced-motion: reduce) {
  .gbc-ring { animation: none; }
}
`

/** Inyecta el <style> una sola vez en <head> (idempotente por id). */
function useGlowBorderStyles() {
  useEffect(() => {
    if (typeof document === 'undefined') return
    if (document.getElementById(STYLE_ID)) return
    const el = document.createElement('style')
    el.id = STYLE_ID
    el.textContent = GBC_CSS
    document.head.appendChild(el)
  }, [])
}

type GlowBorderCardProps = {
  children: ReactNode
  className?: string
}

export function GlowBorderCard({ children, className }: GlowBorderCardProps) {
  useGlowBorderStyles()

  return (
    <div className={cn('gbc-wrap relative rounded-card', className)}>
      <span
        aria-hidden
        className="gbc-ring pointer-events-none absolute inset-0 z-10"
      />
      {children}
    </div>
  )
}
