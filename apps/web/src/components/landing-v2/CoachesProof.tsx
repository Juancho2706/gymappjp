/**
 * CoachesProof — `#coaches`. Sección G del spec de transcripción.
 *
 * QA pre-campaña 2026-08-17: los 3 testimonios del diseño eran FICTICIOS (el propio archivo lo
 * admitía en su TODO-copy) y con tráfico pago eso cambia de categoría — testimonios inventados
 * violan la política de anuncios de Meta (riesgo directo sobre la cuenta publicitaria) y son
 * publicidad engañosa ante SERNAC (Ley 19.496). Se reemplazan por HECHOS verificables del
 * producto, sin personas: cada tarjeta afirma algo que el código o las tiendas pueden respaldar.
 * Cuando existan testimonios reales (nombre + marca + autorización escrita de los coaches
 * activos), esta sección vuelve a ser de quotes; el layout de figure/blockquote quedó en git.
 *
 * Server component (0 interacción). Solo `data-reveal` — el observer global del brand provider
 * hace la animación. Los acentos usan `var(--brand)` literal (lo alimenta `#landing-v2-root`).
 */

import type { CSSProperties } from 'react'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'

const cardStyle: CSSProperties = {
  margin: 0,
  padding: '26px 26px 22px',
  borderRadius: '22px',
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 8px 32px 0 rgba(0,0,0,0.37)',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}

const statStyle: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 800,
  fontSize: '26px',
  letterSpacing: '-0.03em',
  color: '#F8F9FA',
  lineHeight: 1.1,
}

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: '14.5px',
  lineHeight: 1.65,
  color: '#D4D4D8',
  textWrap: 'pretty',
}

const kickerStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: '9.5px',
  letterSpacing: '0.1em',
  textTransform: 'lowercase',
  color: 'var(--brand)',
  transition: 'color 0.2s linear',
}

type Fact = {
  kicker: string
  stat: string
  body: string
}

export default function CoachesProof({ exerciseCount }: { exerciseCount: number }) {
  // Hechos con respaldo: el count sale de la misma query que Módulos/FAQ; la app iOS está
  // publicada (1.1.0, App Store); la marca blanca es la feature central de la sección #marca.
  const facts: Fact[] = [
    {
      kicker: '// catálogo listo el día uno',
      stat: `+${exerciseCount} ejercicios`,
      body: 'Con video y detalle por grupo muscular, listos para prescribir. Sumas los tuyos y quedan solo en tu cuenta.',
    },
    {
      kicker: '// tu marca al frente',
      stat: 'Tu app, tu logo',
      body: 'Tus alumnos entran a tu dominio, con tus colores y tu logo. EVA opera atrás; la marca que ven es la tuya.',
    },
    {
      kicker: '// donde entrena tu alumno',
      stat: 'iPhone y Android',
      body: 'App nativa en la App Store y web instalable en cualquier teléfono, sincronizadas con lo que armas acá.',
    },
  ]

  return (
    <section
      id="coaches"
      style={{
        position: 'relative',
        zIndex: 1,
        padding: '90px 38px 0',
        maxWidth: '1180px',
        margin: '0 auto',
      }}
    >
      <div
        data-reveal
        style={{
          animationDelay: '0s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '14px',
          marginBottom: '36px',
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: '11px',
            letterSpacing: '0.18em',
            textTransform: 'lowercase',
            color: 'var(--brand)',
            fontWeight: 500,
            transition: 'color 0.2s linear',
          }}
        >
          {'// lo que tienes desde el primer día'}
        </div>
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 'clamp(28px, 3.4vw, 44px)',
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
            margin: 0,
            textWrap: 'balance',
          }}
        >
          Menos planilla. Más coaching.
        </h2>
      </div>

      <div
        data-reveal
        className="r-social"
        style={{
          animationDelay: '0.08s',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px',
        }}
      >
        {facts.map((fact) => (
          <div key={fact.kicker} style={cardStyle}>
            <span style={kickerStyle}>{fact.kicker}</span>
            <span style={statStyle}>{fact.stat}</span>
            <p style={bodyStyle}>{fact.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
