/**
 * CoachesProof — `#coaches` (social proof). Sección G del spec de transcripción.
 * Fuente 1:1: nuevalandingv2/LandingPrism v2.dc.html (líneas 424-453).
 *
 * Server component (0 interacción): 3 testimonios estáticos. Solo `data-reveal` —
 * el observer global de reveal (montado por el brand provider) hace la animación.
 * Los avatares usan `var(--brand)` literal (lo alimenta `#landing-v2-root`).
 *
 * TODO-copy: los 3 testimonios son copy del diseño (ficticios). El código actual NO
 * tiene testimonios reales (grep en components/landing → sin fuente real). Mantener el
 * copy del diseño hasta tener testimonios verificados. Ver §6/§G del spec.
 */

import type { CSSProperties } from 'react'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'

const figureStyle: CSSProperties = {
  margin: 0,
  padding: '26px 26px 22px',
  borderRadius: '22px',
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.08)',
  boxShadow: '0 8px 32px 0 rgba(0,0,0,0.37)',
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
}

const quoteStyle: CSSProperties = {
  margin: 0,
  fontSize: '14.5px',
  lineHeight: 1.65,
  color: '#D4D4D8',
  textWrap: 'pretty',
}

const avatarStyle: CSSProperties = {
  width: '34px',
  height: '34px',
  borderRadius: '50%',
  background: 'var(--brand)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: DISPLAY,
  fontWeight: 800,
  fontSize: '12px',
  color: '#FFFFFF',
  transition: 'background 0.4s ease',
}

const roleStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: '9.5px',
  letterSpacing: '0.1em',
  textTransform: 'lowercase',
  color: '#8A8A93',
}

type Testimonial = {
  initials: string
  quote: string
  name: string
  role: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    initials: 'CM',
    quote:
      '“Pasé de cinco planillas a una app con mi logo en una tarde. Mis alumnos registran solos; yo solo reviso las alertas.”',
    name: 'Carolina M.',
    role: 'coach online · 28 alumnos',
  },
  {
    initials: 'RS',
    quote:
      '“El builder me ahorra horas cada semana: armo la rutina base una vez y la ajusto por alumno en minutos.”',
    name: 'Rodrigo S.',
    role: 'preparador físico · 41 alumnos',
  },
  {
    initials: 'VR',
    quote:
      '“Mis alumnos creen que la app es mía. Para mi marca, eso solo ya paga el plan.”',
    name: 'Valentina R.',
    role: 'estudio boutique · 2 coaches',
  },
]

export default function CoachesProof() {
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
          // coaches que ya operan con eva
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
        {TESTIMONIALS.map((t) => (
          <figure key={t.initials} style={figureStyle}>
            <blockquote style={quoteStyle}>{t.quote}</blockquote>
            <figcaption
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '11px',
                marginTop: 'auto',
              }}
            >
              <span style={avatarStyle}>{t.initials}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#F8F9FA' }}>
                  {t.name}
                </span>
                <span style={roleStyle}>{t.role}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
