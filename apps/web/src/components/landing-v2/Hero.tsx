'use client';

/**
 * Hero (`#top`) — landing v2 "Prism". Transcripción 1:1 de
 * `nuevalandingv2/LandingPrism v2.dc.html` líneas 157-259 (+ JS dashboard loop 1121-1143).
 *
 * Piezas:
 *  - Encabezado centrado (H1 con keyword SEO sr-only + span "Tu marca." teñido por --brand).
 *  - Brand rail lockable: 6 swatches (→ lockBrand) + botón "auto" (→ resumeAuto) del provider.
 *  - Showcase glass "browser window" del dashboard coach, con live-loop (setInterval 4200ms)
 *    gateado por reduced-motion.
 *
 * El color de marca lo alimenta `LandingBrandProvider` vía `var(--brand)` / `rgb(var(--brand-rgb) / α)`
 * escritos en `#landing-v2-root`. Este componente solo consume `lockBrand/resumeAuto/lockedIdx/lang`.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLandingBrand } from './_brand-provider';

// ── Font-family mapping (§4 del spec) ────────────────────────────────────────
const FONT_DISPLAY = "var(--font-montserrat), var(--font-inter), sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

// ── i18n local (ES = markup, EN = diccionario JS 1198-1282) ──────────────────
const COPY = {
  es: {
    hero_1: 'Una plataforma.',
    hero_grad: 'Tu marca.',
    hero_sub:
      'Rutinas, nutrición y una app instalable con tu logo y tu color — todo tu negocio de Personal Training en un solo panel. Tú entrenas a tus alumnos; EVA lleva el resto.',
    hero_cta1: 'Crear mi cuenta gratis →',
    hero_cta2: 'Ver cómo se ve →',
    brand_rail: '// el color es tuyo',
    brand_auto: '↻ auto',
  },
  en: {
    hero_1: 'One platform.',
    hero_grad: 'Your brand.',
    hero_sub:
      'Training, nutrition and an installable app with your logo and your color — your whole Personal Training business in one panel. You coach your clients; EVA handles the rest.',
    hero_cta1: 'Create my free account →',
    hero_cta2: 'See how it looks →',
    brand_rail: '// the color is yours',
    brand_auto: '↻ auto',
  },
} as const;

// Paleta de swatches del brand rail (orden y colores del diseño, líneas 174-179).
const RAIL_SWATCHES = [
  { hex: '#007AFF', label: 'EVA blue' },
  { hex: '#00C7BE', label: 'Cyan' },
  { hex: '#16A34A', label: 'Verde' },
  { hex: '#F59E0B', label: 'Ámbar' },
  { hex: '#FF3B1F', label: 'Energy' },
  { hex: '#5856D6', label: 'Violeta' },
];

// Frames del dashboard live-loop (JS 1128-1132). Textos estáticos (sin i18n en el diseño).
const DASH_FRAMES = [
  { adh: '87%', s0: 'sin-registrar-8d', s0Color: '#FF8A80', s0Bg: 'rgba(255,59,48,0.10)', p0: '12%', s2: 'racha · 12d' },
  { adh: '88%', s0: 'registró · hoy', s0Color: '#4ADE80', s0Bg: 'rgba(22,163,74,0.12)', p0: '38%', s2: 'racha · 13d' },
  { adh: '88%', s0: 'registró · hoy', s0Color: '#4ADE80', s0Bg: 'rgba(22,163,74,0.12)', p0: '54%', s2: 'pr-nuevo · sentadilla' },
] as const;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function Hero() {
  const { lang, lockBrand, resumeAuto, lockedIdx } = useLandingBrand();
  const t = COPY[lang === 'en' ? 'en' : 'es'];
  const reduced = usePrefersReducedMotion();
  const autoOn = lockedIdx == null;

  // ── Dashboard live-loop: fade-out (300ms) → advance frame → fade-in. ──
  const [frame, setFrame] = useState(0);
  const [dimmed, setDimmed] = useState(false);
  useEffect(() => {
    if (reduced) return;
    let swapTimer: ReturnType<typeof setTimeout> | undefined;
    const id = setInterval(() => {
      setDimmed(true);
      swapTimer = setTimeout(() => {
        setFrame((i) => (i + 1) % DASH_FRAMES.length);
        setDimmed(false);
      }, 300);
    }, 4200);
    return () => {
      clearInterval(id);
      if (swapTimer) clearTimeout(swapTimer);
    };
  }, [reduced]);
  const f = DASH_FRAMES[frame];
  const fadeStyle = { opacity: dimmed ? 0 : 1, transition: 'opacity 0.3s ease' } as const;

  return (
    <section
      id="top"
      style={{ position: 'relative', zIndex: 1, padding: '92px 38px 40px', maxWidth: 1180, margin: '0 auto' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 22 }}>
        <h1
          data-reveal
          style={{
            animationDelay: '0.08s',
            fontFamily: FONT_DISPLAY,
            fontWeight: 900,
            fontSize: 'clamp(42px, 6.4vw, 88px)',
            lineHeight: 1.04,
            letterSpacing: '-0.045em',
            maxWidth: 1000,
            textWrap: 'balance',
            margin: 0,
            color: '#F8F9FA',
          }}
        >
          <span>{t.hero_1}</span>{' '}
          <span
            style={{
              color: 'var(--brand)',
              transition: 'color 0.2s linear',
              textShadow: '0 0 38px rgb(var(--brand-rgb) / 0.45)',
            }}
          >
            {t.hero_grad}
          </span>
          {/* Keyword SEO invisible dentro del único H1 (§5, opción b) */}
          <span className="sr-only">Software para Personal Trainers en Chile</span>
        </h1>

        <p
          data-reveal
          style={{
            animationDelay: '0.16s',
            fontSize: 17,
            lineHeight: 1.55,
            color: '#A1A1AA',
            maxWidth: 660,
            margin: 0,
            textWrap: 'pretty',
          }}
        >
          {t.hero_sub}
        </p>

        <div
          data-reveal
          style={{
            animationDelay: '0.24s',
            display: 'flex',
            gap: 12,
            marginTop: 6,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <Link
            href="/register"
            onMouseEnter={reduced ? undefined : (e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={reduced ? undefined : (e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 26px',
              borderRadius: 9999,
              background: 'var(--brand)',
              color: '#FFFFFF',
              fontWeight: 600,
              fontSize: 15,
              textDecoration: 'none',
              boxShadow: '0 0 26px -4px rgb(var(--brand-rgb) / 0.75)',
              transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1), background 0.4s ease, box-shadow 0.4s ease',
            }}
          >
            {t.hero_cta1}
          </Link>
          <a
            href="#marca"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '13px 24px',
              borderRadius: 9999,
              background: 'rgba(255,255,255,0.04)',
              color: '#F8F9FA',
              border: '1px solid rgba(255,255,255,0.12)',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              transition: 'background 0.3s ease',
            }}
          >
            {t.hero_cta2}
          </a>
        </div>

        {/* Brand rail: lockable white-label color */}
        <div
          data-reveal
          className="r-brandrail"
          style={{
            animationDelay: '0.3s',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            marginTop: 10,
            padding: '8px 10px 8px 16px',
            borderRadius: 9999,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              color: '#8A8A93',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            {t.brand_rail}
          </span>
          <div id="sw-rail" style={{ display: 'flex', gap: 7 }}>
            {RAIL_SWATCHES.map((sw, i) => (
              <button
                key={sw.hex}
                type="button"
                title={sw.label}
                aria-label={`Fijar color de marca: ${sw.label}`}
                aria-pressed={lockedIdx === i}
                onClick={() => lockBrand(i)}
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  margin: 0,
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  background: sw.hex,
                  boxShadow: `0 0 12px -2px ${sw.hex}`,
                  border: `2px solid ${lockedIdx === i ? 'rgba(255,255,255,0.9)' : 'transparent'}`,
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => resumeAuto()}
            aria-label="Volver al ciclo automático de color"
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 11px',
              borderRadius: 9999,
              border: 'none',
              background: autoOn ? 'rgb(var(--brand-rgb) / 0.18)' : 'rgba(255,255,255,0.06)',
              fontFamily: FONT_MONO,
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: autoOn ? '#fff' : '#A1A1AA',
            }}
          >
            {t.brand_auto}
          </button>
        </div>
      </div>

      {/* Showcase: glass coach dashboard */}
      <div data-reveal style={{ animationDelay: '0.36s', position: 'relative', marginTop: 70, display: 'flex', justifyContent: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: -50,
            transform: 'translateX(-50%)',
            width: 640,
            maxWidth: '80%',
            height: 200,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgb(var(--brand-rgb) / 0.32), transparent 70%)',
            filter: 'blur(70px)',
            pointerEvents: 'none',
            transition: 'background 0.5s ease',
          }}
        />
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            width: 940,
            maxWidth: '100%',
            borderRadius: 16,
            background: '#131316',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 40px 110px rgba(0,0,0,0.6), 0 0 70px -24px rgb(var(--brand-rgb) / 0.4)',
            overflow: 'hidden',
            transition: 'box-shadow 0.5s ease',
          }}
        >
          {/* title bar */}
          <div
            style={{
              height: 34,
              background: '#0e0e10',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '0 14px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f' }} />
            <span style={{ flex: 1, textAlign: 'center', fontFamily: FONT_MONO, fontSize: 10, color: '#8A8A93', letterSpacing: '0.05em' }}>
              app.eva-app.cl/coach
            </span>
          </div>

          <div className="r-dash" style={{ display: 'grid', gridTemplateColumns: '168px 1fr', gap: 0, background: '#0c0c0e' }}>
            {/* sidebar */}
            <div
              className="r-dashside"
              style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '18px 14px', borderRight: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '0 4px' }}>
                <Image src="/LOGOS/eva-icon-white.png" alt="" width={16} height={16} style={{ opacity: 0.85, objectFit: 'contain' }} />
                <span style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#8A8A93', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  coach · juan
                </span>
              </div>
              <div
                style={{
                  padding: '8px 11px',
                  borderRadius: 9,
                  background: 'rgb(var(--brand-rgb) / 0.14)',
                  border: '1px solid rgb(var(--brand-rgb) / 0.3)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 500,
                  transition: 'background 0.4s ease, border-color 0.4s ease',
                }}
              >
                Centro de Control
              </div>
              {['Alumnos', 'Programas', 'Nutrición', 'Marca'].map((item) => (
                <div key={item} style={{ padding: '8px 11px', borderRadius: 9, color: '#A1A1AA', fontSize: 12 }}>
                  {item}
                </div>
              ))}
            </div>

            {/* panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#8A8A93', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                  // centro de control · métricas en vivo
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontFamily: FONT_MONO,
                    fontSize: 9.5,
                    color: '#4ADE80',
                    letterSpacing: '0.12em',
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 6px rgba(74,222,128,0.9)' }} />
                  LIVE
                </span>
              </div>

              {/* KPIs */}
              <div className="r-dashkpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  { label: 'Ingresos mes', value: '$890k' },
                  { label: 'Alumnos', value: '24' },
                  { label: 'Planes activos', value: '18' },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <span style={{ fontFamily: FONT_MONO, fontSize: 8.5, color: '#8A8A93', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                      {kpi.label}
                    </span>
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 900, fontSize: 24, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>
                      {kpi.value}
                    </span>
                  </div>
                ))}
                {/* Adherencia (card brand + live-loop) */}
                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgb(var(--brand-rgb) / 0.08)',
                    border: '1px solid rgb(var(--brand-rgb) / 0.28)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    transition: 'background 0.4s ease, border-color 0.4s ease',
                  }}
                >
                  <span style={{ fontFamily: FONT_MONO, fontSize: 8.5, color: '#cfe3ff', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    Adherencia 7d
                  </span>
                  <span
                    id="kpi-adh"
                    style={{
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 900,
                      fontSize: 24,
                      letterSpacing: '-0.04em',
                      fontVariantNumeric: 'tabular-nums',
                      color: '#FFFFFF',
                      ...fadeStyle,
                    }}
                  >
                    {f.adh}
                  </span>
                </div>
              </div>

              {/* sparkline */}
              <svg viewBox="0 0 760 70" style={{ width: '100%', height: 70, display: 'block' }} preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="prismfill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--brand)" stopOpacity="0.22" />
                    <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,56 L70,48 L140,52 L210,38 L280,43 L350,30 L420,34 L490,22 L560,26 L630,14 L700,18 L760,9 L760,70 L0,70 Z"
                  fill="url(#prismfill)"
                />
                <path
                  d="M0,56 L70,48 L140,52 L210,38 L280,43 L350,30 L420,34 L490,22 L560,26 L630,14 L700,18 L760,9"
                  data-draw=""
                  strokeDasharray="900"
                  stroke="var(--brand)"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transition: 'stroke 0.2s linear' }}
                />
              </svg>

              {/* student rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Row 0 · María Aguilar (status + pct animados) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr auto auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '8px 11px',
                    borderRadius: 9,
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'var(--brand)',
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      fontSize: 9,
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.4s ease',
                    }}
                  >
                    MA
                  </span>
                  <span style={{ fontSize: 12 }}>María Aguilar</span>
                  <span
                    id="dr0-s"
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 9.5,
                      color: f.s0Color,
                      background: f.s0Bg,
                      padding: '2px 7px',
                      borderRadius: 5,
                      ...fadeStyle,
                    }}
                  >
                    {f.s0}
                  </span>
                  <span
                    id="dr0-p"
                    style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', ...fadeStyle }}
                  >
                    {f.p0}
                  </span>
                </div>

                {/* Row 1 · Joaquín Muñoz (estático) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr auto auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '8px 11px',
                    borderRadius: 9,
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'var(--brand)',
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      fontSize: 9,
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.4s ease',
                    }}
                  >
                    JM
                  </span>
                  <span style={{ fontSize: 12 }}>Joaquín Muñoz</span>
                  <span
                    style={{ fontFamily: FONT_MONO, fontSize: 9.5, color: '#4ADE80', background: 'rgba(22,163,74,0.12)', padding: '2px 7px', borderRadius: 5 }}
                  >
                    pr-nuevo · bench-press
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>98%</span>
                </div>

                {/* Row 2 · Camila Pérez (status animado) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr auto auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '8px 11px',
                    borderRadius: 9,
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'var(--brand)',
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 800,
                      fontSize: 9,
                      color: '#fff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'background 0.4s ease',
                    }}
                  >
                    CP
                  </span>
                  <span style={{ fontSize: 12 }}>Camila Pérez</span>
                  <span
                    id="dr2-s"
                    style={{
                      fontFamily: FONT_MONO,
                      fontSize: 9.5,
                      color: '#4ADE80',
                      background: 'rgba(22,163,74,0.12)',
                      padding: '2px 7px',
                      borderRadius: 5,
                      ...fadeStyle,
                    }}
                  >
                    {f.s2}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>96%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default Hero;
export { Hero };
