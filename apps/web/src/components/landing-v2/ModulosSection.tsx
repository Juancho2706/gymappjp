'use client'

/**
 * ModulosSection — `#panel` ("01 · panel coach"). Sección F del spec de transcripción.
 * Fuente 1:1: nuevalandingv2/LandingPrism v2.dc.html (líneas 361-422).
 *
 * Client component por el count-up de la franja de stats (IntersectionObserver).
 * No consume el brand provider: usa `var(--brand)` / `rgb(var(--brand-rgb) / α)` literales
 * (los alimenta `#landing-v2-root`) y `data-reveal` para el observer global de reveal.
 *
 * `exerciseCount` reemplaza el "818" hardcodeado del diseño (aparece en la fila 01 —descripción
 * y tag— y en la stat con count-up), para no mentir el catálogo real. Ver §6/§8 del spec.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'
const ARCHIVO = 'var(--font-archivo), var(--font-montserrat), sans-serif'

const kicker: CSSProperties = {
  fontFamily: MONO,
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'lowercase',
  color: 'var(--brand)',
  fontWeight: 500,
  transition: 'color 0.2s linear',
}

const rowNum: CSSProperties = {
  fontFamily: ARCHIVO,
  fontWeight: 900,
  fontSize: '40px',
  letterSpacing: '-0.05em',
  lineHeight: 1,
  color: 'rgba(255,255,255,0.15)',
  fontVariantNumeric: 'tabular-nums',
}

const rowTitle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 700,
  fontSize: '18px',
  letterSpacing: '-0.02em',
  margin: 0,
}

const rowDesc: CSSProperties = {
  fontSize: '13.5px',
  lineHeight: 1.55,
  color: '#A1A1AA',
  margin: 0,
  maxWidth: '600px',
  textWrap: 'pretty',
}

const rowTag: CSSProperties = {
  fontFamily: MONO,
  fontSize: '10px',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: '#8A8A93',
  whiteSpace: 'nowrap',
  padding: '6px 13px',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '9999px',
}

const statNum: CSSProperties = {
  fontFamily: ARCHIVO,
  fontWeight: 900,
  fontSize: '46px',
  letterSpacing: '-0.04em',
  lineHeight: 0.9,
  fontVariantNumeric: 'tabular-nums',
}

const statLabel: CSSProperties = {
  fontFamily: MONO,
  fontSize: '10px',
  color: '#8A8A93',
  letterSpacing: '0.15em',
  textTransform: 'uppercase',
}

/** Count-up con IntersectionObserver (threshold 0.6, 1200ms, easing 1-(1-x)^3, es-CL).
 *  Inicializa en `target` para que SSR / no-JS muestre el número real; al entrar en
 *  viewport resetea a 0 y anima hasta `target` (idéntico a initCounts del diseño). */
function CountUp({
  target,
  suffix = '',
  className,
  style,
}: {
  target: number
  suffix?: string
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(target)
  const done = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !done.current) {
            done.current = true
            const duration = 1200
            const t0 = performance.now()
            const step = (now: number) => {
              const x = Math.min(1, (now - t0) / duration)
              const eased = 1 - Math.pow(1 - x, 3)
              setVal(Math.round(target * eased))
              if (x < 1) requestAnimationFrame(step)
            }
            requestAnimationFrame(step)
            io.disconnect()
          }
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [target])

  return (
    <span ref={ref} className={className} style={style}>
      {val.toLocaleString('es-CL')}
      {suffix}
    </span>
  )
}

type FeatureRow = {
  n: string
  title: string
  desc: string
  tag: string
}

export default function ModulosSection({ exerciseCount }: { exerciseCount: number }) {
  const rows: FeatureRow[] = [
    {
      n: '01',
      title: 'Builder de rutinas',
      desc: `Supersets, RIR, descansos y ${exerciseCount} ejercicios con GIF. Crea una vez, asigna a todos los alumnos que quieras.`,
      tag: `${exerciseCount} ejercicios`,
    },
    {
      n: '02',
      title: 'Nutrición',
      desc: 'Planes de comida con macros calculadas y log diario del alumno desde su app. Disponible desde el plan Pro.',
      tag: 'macros · log diario',
    },
    {
      n: '03',
      title: 'Seguimiento en vivo',
      desc: 'Adherencia, PRs, peso y rachas de cada alumno, en tiempo real. Alertas automáticas cuando alguien se queda atrás.',
      tag: 'tiempo real',
    },
  ]

  return (
    <section
      id="panel"
      style={{
        position: 'relative',
        zIndex: 1,
        padding: '110px 38px 40px',
        maxWidth: '1180px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div
        data-reveal
        style={{
          animationDelay: '0s',
          maxWidth: '700px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          marginBottom: '40px',
        }}
      >
        <div style={kicker}>{'// 01 · panel coach'}</div>
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 'clamp(30px, 3.8vw, 50px)',
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
            margin: 0,
            textWrap: 'balance',
          }}
        >
          Todo tu negocio, en un panel.
        </h2>
        <p
          style={{
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#A1A1AA',
            maxWidth: '600px',
            margin: 0,
            textWrap: 'pretty',
          }}
        >
          Deja las planillas y los PDFs. Cada módulo está construido para operar con 30+ alumnos sin
          perder el control.
        </p>
      </div>

      {/* Tabla de 4 features */}
      <div
        data-reveal
        style={{
          animationDelay: '0.05s',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: '24px',
          background: 'rgba(255,255,255,0.018)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px 0 rgba(0,0,0,0.37)',
          overflow: 'hidden',
        }}
      >
        {rows.map((row) => (
          <div
            key={row.n}
            className="r-row"
            style={{
              position: 'relative',
              display: 'grid',
              gridTemplateColumns: '92px 1fr auto',
              alignItems: 'center',
              gap: '26px',
              padding: '26px 32px',
              borderBottom: '1px dashed rgba(255,255,255,0.09)',
              transition: 'background 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.025)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ''
            }}
          >
            <span style={rowNum}>{row.n}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <h3 style={rowTitle}>{row.title}</h3>
              <p style={rowDesc}>{row.desc}</p>
            </div>
            <span className="r-rowtag" style={rowTag}>
              {row.tag}
            </span>
          </div>
        ))}

        {/* Fila 04 — destacada white-label */}
        <div
          className="r-row"
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '92px 1fr auto',
            alignItems: 'center',
            gap: '26px',
            padding: '26px 32px',
            background: 'rgb(var(--brand-rgb) / 0.05)',
            transition: 'background 0.3s ease',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: '16px',
              bottom: '16px',
              width: '3px',
              borderRadius: '0 3px 3px 0',
              background: 'var(--brand)',
              boxShadow: '0 0 16px rgb(var(--brand-rgb) / 0.7)',
              transition: 'background 0.3s linear',
            }}
          />
          <span
            style={{
              ...rowNum,
              color: 'var(--brand)',
              transition: 'color 0.2s linear',
            }}
          >
            04
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <h3 style={rowTitle}>Tu marca, no la nuestra</h3>
            <p style={{ ...rowDesc, color: '#C9C9CF' }}>
              Tu logo, tu color y tu nombre en la app que instala el alumno. EVA queda detrás de
              escena.
            </p>
          </div>
          <span
            className="r-rowtag"
            style={{
              ...rowTag,
              color: 'var(--brand)',
              border: '1px solid rgb(var(--brand-rgb) / 0.4)',
              transition: 'color 0.2s linear, border-color 0.3s ease',
            }}
          >
            white-label
          </span>
        </div>
      </div>

      {/* Franja de 4 stats con count-up */}
      <div
        data-reveal
        className="r-stat"
        style={{
          animationDelay: '0s',
          marginTop: '56px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '14px',
          padding: '30px 8px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <CountUp target={exerciseCount} className="r-count" style={statNum} />
          <span style={statLabel}>ejercicios con gif</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <CountUp target={17} className="r-count" style={statNum} />
          <span style={statLabel}>grupos musculares</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <CountUp
            target={100}
            suffix="%"
            className="r-count"
            style={{ ...statNum, color: 'var(--brand)', transition: 'color 0.2s linear' }}
          />
          <span style={statLabel}>tu marca visible</span>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <span style={statNum}>$0</span>
          <span style={statLabel}>plan para empezar</span>
        </div>
      </div>
    </section>
  )
}
