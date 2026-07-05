'use client'

/**
 * Landing v2 "Prism" — PageLoader (§A, líneas 85-103 + JS 1066-1095).
 *
 * Overlay de progreso (anillo + arco animado + barra + %). Sólo en la primera
 * visita de la sesión: gate por `sessionStorage['eva_pl_seen']` y
 * `prefers-reduced-motion`. Se auto-desmonta con fade-out. z-index 200.
 *
 * No-JS / SSR safety: el overlay se renderiza inicialmente invisible
 * (opacity 0, pointer-events none) y sólo se activa cuando el efecto decide
 * mostrarlo → sin JS nunca tapa la página ni bloquea el contenido/SEO.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import Image from 'next/image'

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const MONO = "var(--font-geist-mono), ui-monospace, monospace"
const C = 402.1 // circunferencia del arco de progreso (r=64)
const D = 1050 // duración de la animación (ms)

type Phase = 'hidden' | 'active' | 'done' | 'gone'

export function PageLoader() {
  const [phase, setPhase] = useState<Phase>('hidden')
  const arcRef = useRef<SVGCircleElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const pctRef = useRef<HTMLSpanElement | null>(null)
  const capRef = useRef<HTMLSpanElement | null>(null)

  useIsoLayoutEffect(() => {
    const reduce =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let seen = false
    try {
      seen = sessionStorage.getItem('eva_pl_seen') === '1'
    } catch {
      /* sessionStorage bloqueado */
    }
    if (reduce || seen) {
      setPhase('gone')
      return
    }
    try {
      sessionStorage.setItem('eva_pl_seen', '1')
    } catch {
      /* noop */
    }

    setPhase('active')

    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
    const t0 = performance.now()
    let raf = 0
    const doneTimers: number[] = []

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / D)
      const e = ease(p)
      if (arcRef.current) arcRef.current.setAttribute('stroke-dashoffset', String(C * (1 - e)))
      if (barRef.current) barRef.current.style.width = e * 100 + '%'
      if (pctRef.current) pctRef.current.textContent = Math.round(e * 100) + '%'
      if (p < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        if (capRef.current) capRef.current.textContent = '// listo'
        doneTimers.push(
          window.setTimeout(() => {
            setPhase('done')
            doneTimers.push(window.setTimeout(() => setPhase('gone'), 650))
          }, 280),
        )
      }
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      doneTimers.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  if (phase === 'gone') return null

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#08080a',
    opacity: phase === 'active' ? 1 : 0,
    pointerEvents: phase === 'active' ? 'auto' : 'none',
    transition: phase === 'done' ? 'opacity 0.55s ease' : undefined,
  }

  return (
    <div id="pl-overlay" role="presentation" aria-hidden="true" style={overlayStyle}>
      {/* backdrop: blob radial + grid con mask */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 620,
            height: 620,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgb(var(--brand-rgb) / 0.18) 0%, transparent 62%)',
            filter: 'blur(90px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(rgba(140,140,150,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(140,140,150,0.05) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            WebkitMaskImage:
              'radial-gradient(ellipse 55% 55% at 50% 50%, black 0%, transparent 78%)',
            maskImage: 'radial-gradient(ellipse 55% 55% at 50% 50%, black 0%, transparent 78%)',
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 30,
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 160,
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            style={{ position: 'absolute', inset: 0, animation: 'lv2PlSpin 7s linear infinite' }}
          >
            <circle
              cx="80"
              cy="80"
              r="74"
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
              strokeDasharray="2 7"
              strokeLinecap="round"
            />
          </svg>
          <svg
            width="160"
            height="160"
            viewBox="0 0 160 160"
            style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
          >
            <circle cx="80" cy="80" r="64" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
            <circle
              ref={arcRef}
              cx="80"
              cy="80"
              r="64"
              fill="none"
              stroke="var(--brand)"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray="402.1"
              strokeDashoffset="402.1"
              style={{
                filter: 'drop-shadow(0 0 8px rgb(var(--brand-rgb) / 0.7))',
                transition: 'stroke 0.2s linear',
              }}
            />
          </svg>
          <Image
            src="/LOGOS/eva-icon-white.png"
            alt="EVA"
            width={56}
            height={56}
            priority
            style={{
              position: 'relative',
              width: 56,
              height: 56,
              animation: 'lv2PlFloat 2.8s ease-in-out infinite',
              filter: 'drop-shadow(0 0 14px rgb(var(--brand-rgb) / 0.6))',
              transition: 'filter 0.2s linear',
            }}
          />
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
        >
          <span
            style={{
              fontFamily: 'var(--font-archivo), var(--font-montserrat), sans-serif',
              fontWeight: 900,
              fontSize: 30,
              letterSpacing: '-0.05em',
              color: '#FFFFFF',
            }}
          >
            EVA
          </span>
          <div
            style={{
              position: 'relative',
              width: 200,
              height: 3,
              borderRadius: 99,
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              ref={barRef}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: '0%',
                borderRadius: 99,
                background: 'var(--brand)',
                boxShadow: '0 0 10px rgb(var(--brand-rgb) / 0.8)',
                transition: 'background 0.2s linear',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              ref={capRef}
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#8A8A93',
              }}
            >
              {'// preparando tu espacio'}
            </span>
            <span
              ref={pctRef}
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: '0.06em',
                color: 'var(--brand)',
                fontVariantNumeric: 'tabular-nums',
                transition: 'color 0.2s linear',
              }}
            >
              0%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
