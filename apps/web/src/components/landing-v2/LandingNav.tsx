'use client'

/**
 * Landing v2 "Prism" — LandingNav (§C, líneas 115-155).
 *
 * Tres piezas: nav sticky (C1), menú móvil full-screen (C2) y sticky mobile CTA
 * (C3). El menú y el CTA móvil se muestran vía las media queries de
 * `landing-v2.css` (≤640px). Toggle ES/EN via `useLandingBrand()`.
 * Links reales: /login, /register (Next Link); anclas internas (#marca…).
 */

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import { useLandingBrand } from './_brand-provider'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const DISPLAY = 'var(--font-archivo), var(--font-montserrat), sans-serif'

const NAV_LINKS: { href: string; key: string; es: string }[] = [
  { href: '#marca', key: 'nav_marca', es: 'Tu marca' },
  { href: '#panel', key: 'nav_producto', es: 'Producto' },
  { href: '#modulos', key: 'nav_modulos', es: 'Módulos' },
  { href: '#precios', key: 'nav_precios', es: 'Precios' },
]

const langBtnStyle = (active: boolean): CSSProperties => ({
  all: 'unset',
  cursor: 'pointer',
  padding: '4px 10px',
  borderRadius: 9999,
  fontFamily: MONO,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  color: active ? '#FFFFFF' : '#8A8A93',
  background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
})

export function LandingNav() {
  const { lang, setLang, t } = useLandingBrand()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      {/* ═══ C1 · NAV sticky ═══ */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          padding: '14px 38px',
          background: 'rgba(8,8,10,0.55)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <a
          href="#top"
          style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
        >
          <Image
            src="/LOGOS/eva-icon.png"
            alt="EVA"
            width={23}
            height={23}
            priority
            style={{
              width: 23,
              height: 23,
              filter: 'drop-shadow(0 0 7px rgb(var(--brand-rgb) / 0.6))',
              transition: 'filter 0.4s ease',
            }}
          />
          <span
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 18,
              letterSpacing: '-0.04em',
              background: 'linear-gradient(90deg, #2E5FA3 0%, #007AFF 55%, #00E5FF 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            EVA
          </span>
        </a>

        <div className="r-navlinks" style={{ display: 'flex', gap: 22, marginLeft: 16 }}>
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="lv2-navlink"
              style={{ fontSize: 13, color: '#D4D4D8', textDecoration: 'none' }}
            >
              {t(l.key, l.es)}
            </a>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: 3,
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <button
              type="button"
              aria-pressed={lang === 'es'}
              onClick={() => setLang('es')}
              style={langBtnStyle(lang === 'es')}
            >
              ES
            </button>
            <button
              type="button"
              aria-pressed={lang === 'en'}
              onClick={() => setLang('en')}
              style={langBtnStyle(lang === 'en')}
            >
              EN
            </button>
          </div>

          <Link
            href="/login"
            className="r-navlogin"
            style={{ fontSize: 13, fontWeight: 500, color: '#D4D4D8', textDecoration: 'none' }}
          >
            {t('nav_login', 'Iniciar sesión')}
          </Link>

          <Link
            href="/register"
            className="lv2-cta-pill"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 9999,
              background: 'var(--brand)',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: 13,
              textDecoration: 'none',
              boxShadow: '0 0 22px -4px rgb(var(--brand-rgb) / 0.7)',
              transition:
                'transform 0.3s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s ease, background 0.4s ease',
            }}
          >
            {t('nav_cta', 'Crear cuenta')}
          </Link>

          <button
            type="button"
            className="r-menubtn"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              cursor: 'pointer',
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#F8F9FA',
            }}
          >
            <Menu size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </nav>

      {/* ═══ C2 · MOBILE MENU ═══ */}
      <div
        id="mnav"
        onClick={() => setMenuOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          display: menuOpen ? 'flex' : 'none',
          flexDirection: 'column',
          gap: 4,
          background: 'rgba(8,8,10,0.94)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          padding: '92px 28px 34px',
        }}
      >
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMenuOpen(false)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            position: 'absolute',
            top: 18,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F8F9FA',
            fontSize: 16,
          }}
        >
          ✕
        </button>

        {NAV_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            onClick={() => setMenuOpen(false)}
            style={{
              fontFamily: 'var(--font-montserrat), sans-serif',
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: '-0.03em',
              color: '#F8F9FA',
              textDecoration: 'none',
              padding: '12px 0',
              borderBottom: '1px dashed rgba(255,255,255,0.08)',
            }}
          >
            {t(l.key, l.es)}
          </a>
        ))}

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Link
            href="/register"
            onClick={() => setMenuOpen(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '15px 0',
              borderRadius: 9999,
              background: 'var(--brand)',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              boxShadow: '0 0 26px -4px rgb(var(--brand-rgb) / 0.7)',
            }}
          >
            {t('mcta_cta', 'Crear mi cuenta →')}
          </Link>
          <Link
            href="/login"
            onClick={() => setMenuOpen(false)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '14px 0',
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8F9FA',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            {t('nav_login', 'Iniciar sesión')}
          </Link>
        </div>
      </div>

      {/* ═══ C3 · STICKY MOBILE CTA ═══ */}
      <div
        id="mcta"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 60,
          display: 'none',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
          background: 'rgba(8,8,10,0.72)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Link
          href="/register"
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            padding: '14px 0',
            borderRadius: 9999,
            background: 'var(--brand)',
            color: '#FFFFFF',
            fontWeight: 600,
            fontSize: 15,
            textDecoration: 'none',
            boxShadow: '0 0 22px -4px rgb(var(--brand-rgb) / 0.7)',
            transition: 'background 0.4s ease',
          }}
        >
          {t('mcta_cta2', 'Crear mi cuenta →')}
        </Link>
        <Link
          href="/login"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '14px 20px',
            borderRadius: 9999,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#F8F9FA',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          {t('mcta_login', 'Entrar')}
        </Link>
      </div>
    </>
  )
}
