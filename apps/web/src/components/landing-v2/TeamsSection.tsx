/**
 * TeamsSection — `#teams`. Sección J del spec de transcripción.
 * Fuente 1:1: nuevalandingv2/LandingPrism v2.dc.html (líneas 757-793).
 *
 * Server component (0 interacción de estado): card + 3 items. `data-reveal` para el
 * observer global de reveal; `var(--brand)` / `rgb(var(--brand-rgb) / α)` literales
 * (los alimenta `#landing-v2-root`). El hover del CTA se resuelve con un `<style>` scoped
 * (sin JS), para mantener el componente server.
 *
 * Datos reales (§6): el CTA usa `teamsContactMailto()` (subject "EVA Teams - quiero conversar")
 * en vez del mailto hardcodeado del diseño. Regla anti-precio: Teams NO lleva números de precio,
 * solo capacidades + contacto de ventas — el diseño ya lo respeta.
 */

import type { CSSProperties } from 'react'
import { Users, Shield, BarChart3, type LucideIcon } from 'lucide-react'
import { teamsContactMailto } from '@/lib/brand-assets'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'

const itemRow: CSSProperties = {
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 16px',
  borderRadius: '14px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
}

const iconWrap: CSSProperties = {
  color: 'var(--brand)',
  display: 'inline-flex',
  transition: 'color 0.2s linear',
}

const ITEMS: { Icon: LucideIcon; title: string; desc: string }[] = [
  { Icon: Users, title: 'Pool de alumnos compartido', desc: 'Asigna alumnos a coaches con un clic.' },
  { Icon: Shield, title: 'Datos aislados por coach', desc: 'Privacidad a nivel de base de datos.' },
  { Icon: BarChart3, title: 'Reportes del equipo', desc: 'Adherencia y alertas de todos, en vivo.' },
]

export default function TeamsSection() {
  return (
    <section
      id="teams"
      style={{
        position: 'relative',
        zIndex: 1,
        padding: '40px 38px 100px',
        maxWidth: '1180px',
        margin: '0 auto',
      }}
    >
      <style>{`.lv2-teams-cta:hover{background:rgba(255,255,255,0.09)!important;}`}</style>
      <div
        data-reveal
        className="r-teams"
        style={{
          animationDelay: '0s',
          position: 'relative',
          padding: '42px 46px',
          borderRadius: '26px',
          background: 'rgba(255,255,255,0.022)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.37)',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: '1.1fr 1fr',
          gap: '48px',
          alignItems: 'center',
        }}
      >
        {/* Glow brand */}
        <div
          style={{
            position: 'absolute',
            top: '-80px',
            left: '-80px',
            width: '280px',
            height: '280px',
            borderRadius: '50%',
            background: 'rgb(var(--brand-rgb) / 0.16)',
            filter: 'blur(90px)',
            pointerEvents: 'none',
            transition: 'background 0.5s ease',
          }}
        />

        {/* Izquierda: pitch + CTA */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
            // modo teams
          </div>
          <h2
            style={{
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: 'clamp(26px, 3vw, 38px)',
              letterSpacing: '-0.035em',
              lineHeight: 1.08,
              margin: 0,
              textWrap: 'balance',
            }}
          >
            ¿Más de un coach? Trabajen en el mismo panel.
          </h2>
          <p
            style={{
              fontSize: '14.5px',
              lineHeight: 1.6,
              color: '#A1A1AA',
              margin: 0,
              textWrap: 'pretty',
            }}
          >
            Modo Teams: pool de alumnos compartido, datos aislados por coach y reportes del equipo en
            un solo lugar. Para duplas, estudios y gimnasios boutique.
          </p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '10px', flexWrap: 'wrap' }}>
            <a
              href={teamsContactMailto('landing-v2')}
              className="lv2-teams-cta"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 20px',
                borderRadius: '9999px',
                background: 'rgba(255,255,255,0.05)',
                color: '#F8F9FA',
                border: '1px solid rgba(255,255,255,0.14)',
                fontWeight: 600,
                fontSize: '13px',
                textDecoration: 'none',
                backdropFilter: 'blur(12px)',
              }}
            >
              Conocer Teams →
            </a>
          </div>
        </div>

        {/* Derecha: 3 capacidades */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {ITEMS.map((item) => (
            <div key={item.title} style={itemRow}>
              <span style={iconWrap}>
                <item.Icon />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontWeight: 600, fontSize: '13.5px' }}>{item.title}</span>
                <span style={{ fontSize: '12px', color: '#A1A1AA' }}>{item.desc}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
