'use client'

/**
 * FaqSection — `#faq` (§K del spec de transcripción landing-v2).
 *
 * Fidelidad 1:1 con `nuevalandingv2/LandingPrism v2.dc.html` (líneas 795-823):
 * 5 `<details>`/`<summary>` NATIVOS (el acordeón funciona sin JS de acordeón).
 * El "+" rota 45° al abrir vía CSS `[open]` — incluida acá (styled-jsx) para que
 * la sección sea autosuficiente aunque `landing-v2.css` aún no cargue.
 *
 * Nota de contrato (§7): la tabla marca FaqSection como server. Se porta como
 * client SOLO para reaccionar al toggle de idioma (`lang` del provider): un toggle
 * ES/EN transversal exige que TODO el texto visible cambie, y un server component no
 * puede suscribirse al contexto client. El contenido igual se renderiza en SSR
 * (client components emiten su HTML inicial en el App Router) → SEO/FAQPage intactos.
 * El único "JS" que agrega es leer el idioma; el acordeón sigue siendo nativo.
 */

import { useLandingBrand } from './_brand-provider'

const FONT_MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const FONT_DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'

const COPY = {
    es: {
        mark: '// preguntas frecuentes',
        title: 'Antes de que preguntes.',
        items: [
            {
                q: '¿Puedo cancelar cuando quiera?',
                a: 'Sí. No hay contratos: cambias de plan o cancelas desde tu panel y sigues con acceso hasta el fin del período pagado.',
            },
            {
                q: '¿Qué pasa si supero mi cupo de alumnos?',
                a: 'Subes al plan siguiente con un clic. No se borra nada: tus rutinas, historiales y alumnos se mantienen intactos.',
            },
            {
                q: '¿Mis alumnos pagan algo por la app?',
                a: 'No. Instalan tu app gratis y entran con un código de 5 dígitos. Tú pagas solo tu plan de coach.',
            },
            {
                q: '¿Puedo migrar mis rutinas desde Excel?',
                a: 'Sí. Cargas tu rutina una vez en el builder —con los 818 ejercicios del catálogo— y la reutilizas con todos los alumnos que quieras.',
            },
            {
                q: '¿Necesito tarjeta para empezar?',
                a: 'No. El plan Free es permanente para hasta 3 alumnos, sin tarjeta y con el builder completo.',
            },
        ],
    },
    en: {
        mark: '// frequently asked questions',
        title: 'Before you ask.',
        items: [
            {
                q: 'Can I cancel anytime?',
                a: 'Yes. No contracts: change plans or cancel from your panel and keep access until the end of the paid period.',
            },
            {
                q: 'What if I outgrow my client slots?',
                a: 'Upgrade to the next plan in one click. Nothing is deleted: routines, history and clients stay intact.',
            },
            {
                q: 'Do my clients pay anything for the app?',
                a: 'No. They install your app for free and log in with a 5-digit code. You only pay your coach plan.',
            },
            {
                q: 'Can I migrate my routines from Excel?',
                a: 'Yes. Load a routine once in the builder —with the 818-exercise catalog— and reuse it with as many clients as you want.',
            },
            {
                q: 'Do I need a card to start?',
                a: 'No. The Free plan is permanent for up to 3 clients, no card, with the full builder.',
            },
        ],
    },
} as const

export function FaqSection() {
    const { lang } = useLandingBrand()
    const t = COPY[lang === 'en' ? 'en' : 'es']
    const lastIndex = t.items.length - 1

    return (
        <section
            id="faq"
            aria-labelledby="faq-title"
            style={{
                position: 'relative',
                zIndex: 1,
                padding: '20px 38px 60px',
                maxWidth: 820,
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
                    gap: 14,
                    marginBottom: 30,
                }}
            >
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
                    {t.mark}
                </div>
                <h2
                    id="faq-title"
                    style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 800,
                        fontSize: 'clamp(26px, 3vw, 38px)',
                        letterSpacing: '-0.035em',
                        lineHeight: 1.05,
                        margin: 0,
                    }}
                >
                    {t.title}
                </h2>
            </div>

            <div
                data-reveal
                className="lv2-faq-card"
                style={{
                    animationDelay: '0.06s',
                    borderRadius: 24,
                    background: 'rgba(255,255,255,0.018)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    boxShadow: '0 8px 32px 0 rgba(0,0,0,0.37)',
                    overflow: 'hidden',
                }}
            >
                {t.items.map((item, i) => (
                    <details
                        key={i}
                        className="lv2-faq-i"
                        style={
                            i === lastIndex
                                ? undefined
                                : { borderBottom: '1px dashed rgba(255,255,255,0.09)' }
                        }
                    >
                        <summary
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                padding: '20px 26px',
                            }}
                        >
                            <span
                                style={{
                                    flex: 1,
                                    fontWeight: 600,
                                    fontSize: 15,
                                    color: '#F8F9FA',
                                }}
                            >
                                {item.q}
                            </span>
                            <span
                                className="lv2-faq-x"
                                aria-hidden="true"
                                style={{
                                    fontFamily: FONT_MONO,
                                    color: 'var(--brand)',
                                    fontSize: 18,
                                    lineHeight: 1,
                                }}
                            >
                                +
                            </span>
                        </summary>
                        <p
                            style={{
                                margin: 0,
                                padding: '0 26px 20px',
                                fontSize: 13.5,
                                lineHeight: 1.6,
                                color: '#A1A1AA',
                                maxWidth: 640,
                            }}
                        >
                            {item.a}
                        </p>
                    </details>
                ))}
            </div>

            <style jsx>{`
                .lv2-faq-i > summary {
                    cursor: pointer;
                    list-style: none;
                    outline: none;
                }
                .lv2-faq-i > summary::-webkit-details-marker {
                    display: none;
                }
                .lv2-faq-i > summary::marker {
                    display: none;
                    content: '';
                }
                .lv2-faq-i > summary:focus-visible {
                    outline: 2px solid var(--brand);
                    outline-offset: -2px;
                    border-radius: 12px;
                }
                .lv2-faq-x {
                    transition: transform 0.25s ease;
                }
                .lv2-faq-i[open] .lv2-faq-x {
                    transform: rotate(45deg);
                }
                @media (prefers-reduced-motion: reduce) {
                    .lv2-faq-x {
                        transition: none;
                    }
                }
            `}</style>
        </section>
    )
}
