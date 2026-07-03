/**
 * Landing v2 "Prism" — LandingFooter (§M, líneas 840-856).
 *
 * Server component (mejor SSR/SEO; links crawlables). Sin i18n: el toggle ES/EN
 * es sólo visual y afecta a los componentes cliente (nav/hero/…), no al footer.
 * Datos reales: Aviso legal → /legal; email → SALES_EMAIL.
 */

import Link from 'next/link'
import Image from 'next/image'
import { SALES_EMAIL } from '@/lib/brand-assets'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'

const FOOTER_LINKS: { href: string; label: string }[] = [
  { href: '#marca', label: 'Tu marca' },
  { href: '#panel', label: 'Producto' },
  { href: '#modulos', label: 'Módulos' },
  { href: '#precios', label: 'Precios' },
]

export function LandingFooter() {
  return (
    <footer
      style={{
        position: 'relative',
        zIndex: 1,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '36px 38px',
        maxWidth: 1180,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Image
          src="/LOGOS/eva-icon.png"
          alt=""
          width={18}
          height={18}
          style={{ width: 18, height: 18, opacity: 0.85 }}
        />
        <span
          style={{
            fontFamily: 'var(--font-archivo), var(--font-montserrat), sans-serif',
            fontWeight: 900,
            fontSize: 14,
            letterSpacing: '-0.04em',
          }}
        >
          EVA
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: '#8A8A93',
            letterSpacing: '0.1em',
            marginLeft: 6,
          }}
        >
          © 2026
        </span>
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {FOOTER_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            style={{ fontSize: 12, color: '#A1A1AA', textDecoration: 'none' }}
          >
            {l.label}
          </a>
        ))}
        <Link href="/legal" style={{ fontSize: 12, color: '#A1A1AA', textDecoration: 'none' }}>
          Aviso legal
        </Link>
        <a
          href={`mailto:${SALES_EMAIL}`}
          style={{ fontSize: 12, color: '#A1A1AA', textDecoration: 'none' }}
        >
          {SALES_EMAIL}
        </a>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: '#8A8A93',
          letterSpacing: '0.08em',
        }}
      >
        // hecho en chile · pwa instalable · sin tracking de terceros
      </div>
    </footer>
  )
}
