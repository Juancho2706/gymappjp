'use client'

/**
 * CtaFinal — sección de cierre (§L del spec de transcripción landing-v2).
 *
 * Fidelidad 1:1 con `nuevalandingv2/LandingPrism v2.dc.html` (líneas 825-838):
 * card centrada con borde/glow brand, ícono EVA blanco, título display y 2 CTAs
 * ("Crear mi cuenta →" → /register · "Escríbenos" → mailto SALES_EMAIL).
 *
 * Contrato (§7): la tabla marca CtaFinal como server. Se porta como client SOLO
 * para reaccionar al toggle de idioma del provider (mismo criterio que FaqSection).
 * El HTML igual se renderiza en SSR. Datos reales: mailto vía `SALES_EMAIL`
 * (`lib/brand-assets.ts`), no el literal del diseño.
 */

import Image from 'next/image'
import Link from 'next/link'
import { SALES_EMAIL } from '@/lib/brand-assets'
import { useLandingBrand } from './_brand-provider'

const FONT_MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const FONT_DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'

const COPY = {
    es: {
        mark: '// listo cuando tú lo estés',
        title: 'Profesionaliza tu coaching.',
        sub: 'Crea tu cuenta en minutos y ajusta tu plan cuando crezcas. Empiezas gratis, sin tarjeta.',
        cta1: 'Crear mi cuenta →',
        cta2: 'Escríbenos',
    },
    en: {
        mark: '// ready when you are',
        title: 'Take your coaching pro.',
        sub: 'Create your account in minutes and adjust your plan as you grow. Start free, no card.',
        cta1: 'Create my account →',
        cta2: 'Write to us',
    },
} as const

export function CtaFinal() {
    const { lang } = useLandingBrand()
    const t = COPY[lang === 'en' ? 'en' : 'es']

    return (
        <section
            aria-labelledby="cta-final-title"
            style={{
                position: 'relative',
                zIndex: 1,
                padding: '40px 38px 110px',
                maxWidth: 1180,
                margin: '0 auto',
                textAlign: 'center',
            }}
        >
            <div
                data-reveal
                style={{
                    animationDelay: '0s',
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                    alignItems: 'center',
                    padding: '64px 38px',
                    borderRadius: 30,
                    overflow: 'hidden',
                    border: '1px solid rgb(var(--brand-rgb) / 0.2)',
                    background: 'rgba(255,255,255,0.015)',
                    transition: 'border-color 0.5s ease',
                }}
            >
                <div
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                            'radial-gradient(ellipse 70% 120% at 50% 120%, rgb(var(--brand-rgb) / 0.22), transparent 70%)',
                        pointerEvents: 'none',
                        transition: 'background 0.5s ease',
                    }}
                />
                <Image
                    src="/LOGOS/eva-icon-white.png"
                    alt=""
                    aria-hidden="true"
                    width={36}
                    height={36}
                    style={{
                        position: 'relative',
                        width: 36,
                        height: 36,
                        filter: 'drop-shadow(0 0 16px rgb(var(--brand-rgb) / 0.6))',
                        transition: 'filter 0.4s ease',
                    }}
                />
                <div
                    style={{
                        position: 'relative',
                        fontFamily: FONT_MONO,
                        fontSize: 11,
                        letterSpacing: '0.18em',
                        textTransform: 'lowercase',
                        color: 'var(--brand)',
                        fontWeight: 500,
                        transition: 'color 0.2s linear',
                    }}
                >
                    {t.mark}
                </div>
                <h2
                    id="cta-final-title"
                    style={{
                        position: 'relative',
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 900,
                        fontSize: 'clamp(36px, 5vw, 64px)',
                        letterSpacing: '-0.045em',
                        lineHeight: 1.02,
                        margin: 0,
                        textWrap: 'balance',
                        maxWidth: 760,
                    }}
                >
                    {t.title}
                </h2>
                <p
                    style={{
                        position: 'relative',
                        fontSize: 16,
                        color: '#A1A1AA',
                        maxWidth: 520,
                        margin: 0,
                        textWrap: 'pretty',
                    }}
                >
                    {t.sub}
                </p>
                <div
                    style={{
                        position: 'relative',
                        display: 'flex',
                        gap: 12,
                        marginTop: 10,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                    }}
                >
                    <Link
                        href="/register"
                        className="lv2-brandbtn"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '14px 26px',
                            borderRadius: '9999px',
                            background: 'var(--brand)',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: 15,
                            textDecoration: 'none',
                            boxShadow: '0 0 26px -4px var(--brand)',
                        }}
                    >
                        {t.cta1}
                    </Link>
                    <a
                        href={`mailto:${SALES_EMAIL}`}
                        className="lv2-ghostbtn"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '13px 24px',
                            borderRadius: '9999px',
                            color: '#F8F9FA',
                            border: '1px solid rgba(255,255,255,0.12)',
                            fontWeight: 600,
                            fontSize: 14,
                            textDecoration: 'none',
                        }}
                    >
                        {t.cta2}
                    </a>
                </div>
            </div>

            <style jsx>{`
                .lv2-ghostbtn {
                    background: rgba(255, 255, 255, 0.04);
                    transition: background 0.25s ease, border-color 0.25s ease;
                }
                .lv2-ghostbtn:hover {
                    background: rgba(255, 255, 255, 0.08);
                }
                .lv2-brandbtn {
                    transition: transform 0.3s ease, background 0.4s ease,
                        box-shadow 0.4s ease;
                }
                .lv2-brandbtn:hover {
                    transform: translateY(-2px);
                }
                @media (prefers-reduced-motion: reduce) {
                    .lv2-brandbtn {
                        transition: background 0.4s ease, box-shadow 0.4s ease;
                    }
                    .lv2-brandbtn:hover {
                        transform: none;
                    }
                }
            `}</style>
        </section>
    )
}
