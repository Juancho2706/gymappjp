'use client';

/**
 * MarcaShowcase (`#marca`) — centerpiece white-label. Transcripción 1:1 de
 * `nuevalandingv2/LandingPrism v2.dc.html` líneas 261-359.
 *
 * Piezas:
 *  - Header centrado (icono + kicker + h2 + lede).
 *  - Grid `1fr 1.05fr` (`.r-marca`): izquierda = 3 beneficios white-label + card "pruébalo en vivo"
 *    con 6 swatches grandes (→ lockBrand) + auto (→ resumeAuto); derecha = "morphing phone".
 *
 * El "morphing" del teléfono NO es un keyframe ni un timer local: es el mismo mecanismo global del
 * `LandingBrandProvider` — el color de marca vive en `var(--brand)` / `rgb(var(--brand-rgb) / α)` y el
 * provider lo reescribe cada frame en `#landing-v2-root`; cada superficie brand del teléfono lleva
 * `transition` sobre background/box-shadow/filter, así que "muta de marca" al cambiar el color (auto o
 * fijado por un swatch). Bajo reduced-motion el provider deja el color fijo → el teléfono queda estático
 * (fallback digno, sin animación).
 */

import Image from 'next/image';
import { type CSSProperties } from 'react';
import { useLandingBrand } from './_brand-provider';

// ── Font-family mapping (§4 del spec) ────────────────────────────────────────
const FONT_DISPLAY = "var(--font-montserrat), var(--font-inter), sans-serif";
const FONT_MONO = "var(--font-geist-mono), ui-monospace, monospace";

// ── i18n local (ES = markup, EN = diccionario JS 1206-1211) ──────────────────
const COPY = {
  es: {
    s_wl_mark: '// white-label',
    s_wl_title: 'El mismo motor. Mil marcas distintas.',
    s_wl_lede:
      'Tu alumno nunca ve "EVA". Ve tu logo, tu nombre y tu color en la pantalla de inicio de su teléfono. Toca un color arriba para fijarlo — todo el sitio cambia contigo.',
    wl_p1t: 'Tu color, en cada pantalla',
    wl_p1d: 'Eliges un color de marca y EVA lo aplica a botones, anillos, glows y acentos de toda la app del alumno.',
    wl_p2t: 'Tu logo y tu nombre',
    wl_p2d: 'Sube tu logo y la app se instala con tu marca. EVA queda detrás de escena, siempre.',
    wl_p3t: 'Acceso simple para el alumno',
    wl_p3_pre: 'Tu alumno entra con un ',
    wl_p3_code: 'código de 5 dígitos',
    wl_p3_post: ' — sin tiendas, sin descargas, sin fricción.',
    wl_try: '// pruébalo en vivo · fija un color',
    wl_auto: '↻ auto',
  },
  en: {
    s_wl_mark: '// white-label',
    s_wl_title: 'Same engine. A thousand different brands.',
    s_wl_lede:
      'Your client never sees “EVA”. They see your logo, your name and your color on their phone’s home screen. Tap a color above to lock it — the whole site changes with you.',
    wl_p1t: 'Your color, on every screen',
    wl_p1d: 'Pick a brand color and EVA applies it to buttons, rings, glows and accents across the client app.',
    wl_p2t: 'Your logo and your name',
    wl_p2d: 'Upload your logo and the app installs with your brand. EVA stays behind the scenes, always.',
    wl_p3t: 'Simple access for your client',
    wl_p3_pre: 'Your client logs in with a ',
    wl_p3_code: '5-digit code',
    wl_p3_post: ' — no app stores, no downloads, no friction.',
    wl_try: '// try it live · lock a color',
    wl_auto: '↻ auto',
  },
} as const;

// Swatches grandes de la card "pruébalo en vivo" (líneas 298-303).
const BIG_SWATCHES = [
  { hex: '#007AFF', label: 'Azul EVA' },
  { hex: '#00C7BE', label: 'Teal' },
  { hex: '#16A34A', label: 'Verde' },
  { hex: '#F59E0B', label: 'Ámbar' },
  { hex: '#FF3B1F', label: 'Rojo energía' },
  { hex: '#5856D6', label: 'Violeta' },
];

// Anillos de progreso del teléfono (líneas 331-341).
const PHONE_RINGS = [
  { color: 'var(--brand)', dash: '107.8 138.2', value: 78, label: 'Entrenos', opacity: 1, transition: true },
  { color: 'var(--brand)', dash: '99.5 138.2', value: 72, label: 'Nutrición', opacity: 0.7, transition: true },
  { color: '#4ADE80', dash: '117.5 138.2', value: 85, label: 'Check-ins', opacity: 1, transition: false },
] as const;

const barStyle: CSSProperties = {
  width: 2,
  alignSelf: 'stretch',
  minHeight: 40,
  borderRadius: 2,
  background: 'var(--brand)',
  boxShadow: '0 0 12px rgb(var(--brand-rgb) / 0.5)',
  flexShrink: 0,
  transition: 'background 0.3s linear',
};
const benefitTitleStyle: CSSProperties = { fontWeight: 600, fontSize: 15 };
const benefitDescStyle: CSSProperties = { fontSize: 13.5, lineHeight: 1.55, color: '#A1A1AA' };

function MarcaShowcase() {
  const { lang, lockBrand, resumeAuto, lockedIdx } = useLandingBrand();
  const t = COPY[lang === 'en' ? 'en' : 'es'];

  return (
    <section
      id="marca"
      style={{ position: 'relative', zIndex: 1, padding: '130px 38px 60px', maxWidth: 1180, margin: '0 auto' }}
    >
      {/* Header */}
      <div
        data-reveal
        style={{
          animationDelay: '0s',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 14,
          marginBottom: 52,
        }}
      >
        <Image
          src="/LOGOS/eva-icon-white.png"
          alt=""
          width={40}
          height={40}
          style={{ filter: 'drop-shadow(0 0 16px rgb(var(--brand-rgb) / 0.65))', transition: 'filter 0.4s ease', objectFit: 'contain' }}
        />
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'lowercase',
            color: 'var(--brand)',
            fontWeight: 500,
            transition: 'color 0.2s linear',
          }}
        >
          {t.s_wl_mark}
        </div>
        <h2
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: 800,
            fontSize: 'clamp(30px, 4vw, 54px)',
            letterSpacing: '-0.04em',
            lineHeight: 1.03,
            margin: 0,
            maxWidth: 760,
            textWrap: 'balance',
          }}
        >
          {t.s_wl_title}
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: '#A1A1AA', maxWidth: 600, margin: 0, textWrap: 'pretty' }}>
          {t.s_wl_lede}
        </p>
      </div>

      {/* Grid: benefits + morphing phone */}
      <div
        data-reveal
        className="r-marca"
        style={{ animationDelay: '0.1s', display: 'grid', gridTemplateColumns: '1fr 1.05fr', gap: 56, alignItems: 'center' }}
      >
        {/* left: the three benefits + try */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={barStyle} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={benefitTitleStyle}>{t.wl_p1t}</span>
              <span style={benefitDescStyle}>{t.wl_p1d}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={barStyle} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={benefitTitleStyle}>{t.wl_p2t}</span>
              <span style={benefitDescStyle}>{t.wl_p2d}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={barStyle} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={benefitTitleStyle}>{t.wl_p3t}</span>
              <span style={benefitDescStyle}>
                {t.wl_p3_pre}
                <span style={{ fontFamily: FONT_MONO, fontSize: 12.5, color: 'var(--brand)', transition: 'color 0.2s linear' }}>
                  {t.wl_p3_code}
                </span>
                {t.wl_p3_post}
              </span>
            </div>
          </div>

          {/* try-it-live card */}
          <div
            style={{
              marginTop: 8,
              padding: '16px 18px',
              borderRadius: 16,
              background: 'rgba(255,255,255,0.025)',
              border: '1px dashed rgba(255,255,255,0.12)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#8A8A93', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              {t.wl_try}
            </span>
            <div className="r-swbig" style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {BIG_SWATCHES.map((sw, i) => (
                <button
                  key={sw.hex}
                  type="button"
                  aria-label={`Fijar color de marca: ${sw.label}`}
                  aria-pressed={lockedIdx === i}
                  onClick={() => lockBrand(i)}
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    margin: 0,
                    width: 30,
                    height: 30,
                    borderRadius: 9,
                    background: sw.hex,
                    boxShadow: `0 0 14px -2px ${sw.hex}`,
                    border: '2px solid transparent',
                    boxSizing: 'border-box',
                  }}
                />
              ))}
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
                  padding: '0 14px',
                  height: 30,
                  borderRadius: 9,
                  border: 'none',
                  background: 'rgba(255,255,255,0.06)',
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#A1A1AA',
                }}
              >
                {t.wl_auto}
              </button>
            </div>
          </div>
        </div>

        {/* right: the morphing phone */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 560 }}>
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: '6% 12%',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgb(var(--brand-rgb) / 0.34), transparent 70%)',
              filter: 'blur(72px)',
              pointerEvents: 'none',
              transition: 'background 0.5s ease',
            }}
          />
          <div
            style={{
              position: 'relative',
              width: 268,
              borderRadius: 42,
              padding: 10,
              background: 'linear-gradient(180deg, #1a1a1d 0%, #0a0a0a 100%)',
              border: '1px solid rgba(255,255,255,0.14)',
              boxShadow: '0 44px 110px rgba(0,0,0,0.55), 0 0 64px -10px rgb(var(--brand-rgb) / 0.45)',
              transition: 'box-shadow 0.5s ease',
            }}
          >
            <div style={{ borderRadius: 34, background: '#0a0a0a', overflow: 'hidden', position: 'relative', height: 540 }}>
              {/* notch */}
              <div
                aria-hidden="true"
                style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: 82, height: 17, background: '#000', borderRadius: 99, zIndex: 5 }}
              />
              <div style={{ padding: '44px 18px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
                {/* header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      background: 'var(--brand)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontFamily: FONT_DISPLAY,
                      fontWeight: 900,
                      fontSize: 14,
                      boxShadow: '0 0 14px -2px var(--brand)',
                      transition: 'all 0.4s ease',
                    }}
                  >
                    J
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 13.5, letterSpacing: '-0.02em' }}>Coach Juan</span>
                    <span style={{ fontFamily: FONT_MONO, fontSize: 8.5, color: '#8A8A93', letterSpacing: '0.1em' }}>juan.eva-app.cl</span>
                  </div>
                  <span
                    style={{
                      marginLeft: 'auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 99,
                      background: 'rgb(var(--brand-rgb) / 0.16)',
                      color: 'var(--brand)',
                      fontFamily: FONT_MONO,
                      fontSize: 9,
                      fontWeight: 600,
                      transition: 'all 0.4s ease',
                    }}
                  >
                    12d
                  </span>
                </div>

                {/* today */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 8.5, color: '#8A8A93', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                    // hoy · martes
                  </span>
                  <span style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 23, letterSpacing: '-0.03em' }}>Push Day · A</span>
                </div>

                {/* start button (mockup — no interacción real) */}
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  style={{
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    width: '100%',
                    padding: '13px 0',
                    borderRadius: 99,
                    border: 'none',
                    background: 'var(--brand)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 13.5,
                    boxShadow: '0 0 26px -4px var(--brand)',
                    transition: 'all 0.4s ease',
                    cursor: 'pointer',
                  }}
                >
                  ▶ Empezar entreno
                </button>

                {/* rings */}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  {PHONE_RINGS.map((ring) => (
                    <div key={ring.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <svg width="50" height="50" viewBox="0 0 52 52" aria-hidden="true">
                        <circle cx="26" cy="26" r="22" stroke="rgba(255,255,255,0.08)" strokeWidth="5" fill="none" />
                        <circle
                          cx="26"
                          cy="26"
                          r="22"
                          stroke={ring.color}
                          strokeWidth="5"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={ring.dash}
                          transform="rotate(-90 26 26)"
                          style={{ transition: ring.transition ? 'stroke 0.2s linear' : undefined, opacity: ring.opacity }}
                        />
                        <text x="26" y="30" textAnchor="middle" fontFamily={FONT_DISPLAY} fontWeight="800" fontSize="11" fill="#F8F9FA">
                          {ring.value}
                        </text>
                      </svg>
                      <span style={{ fontFamily: FONT_MONO, fontSize: 7, color: '#8A8A93', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                        {ring.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* exercise rows */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgb(var(--brand-rgb) / 0.08)',
                      border: '1px solid rgb(var(--brand-rgb) / 0.22)',
                      fontSize: 11.5,
                      color: '#E4E4E7',
                      transition: 'all 0.4s ease',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--brand)', transition: 'background 0.3s linear' }} />
                    Bench Press · 4×8 · RIR 2
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontSize: 11.5,
                      color: '#D4D4D8',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3f3f46' }} />
                    Incline DB · 3×10
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      fontSize: 11.5,
                      color: '#D4D4D8',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3f3f46' }} />
                    Cable Fly · 3×12
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default MarcaShowcase;
export { MarcaShowcase };
