'use client'

/**
 * FaqSection — `#faq` (§K del spec de transcripción landing-v2).
 *
 * Fidelidad 1:1 con `nuevalandingv2/LandingPrism v2.dc.html` (líneas 795-823):
 * 5 `<details>`/`<summary>` NATIVOS (el acordeón funciona sin JS de acordeón).
 *
 * CSS del acordeón (§K/§7): el marcador por defecto se elimina INLINE con
 * `display:flex` (suprime el triángulo en Blink/WebKit) + `listStyle:none` (Firefox),
 * sin depender de ninguna hoja externa. La rotación 45° del "+" al abrir usa el
 * selector `.faq-i[open] .faq-x` que vive en `landing-v2.css` (deliverable del
 * provider/foundation) — por eso se conservan los NOMBRES de clase EXACTOS del
 * contrato `faq-i` / `faq-x`. Si esa hoja aún no cargó, el acordeón sigue funcional
 * (el "+" simplemente no rota) → degradación elegante.
 *
 * Nota de contrato (§7): la tabla marca FaqSection como server. Se porta como client
 * SOLO para reaccionar al toggle de idioma (`t()` del provider): un toggle ES/EN
 * transversal exige que TODO el texto visible cambie, y un server component no puede
 * suscribirse al contexto client. El HTML igual se renderiza en SSR → SEO intacto.
 */

import { useLandingBrand } from './_brand-provider'

const FONT_MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const FONT_DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'

// [keyPregunta, ES pregunta, keyRespuesta, ES respuesta] — el EN sale de EN_DICT vía t().
const FAQ_ITEMS: [string, string, string, string][] = [
    [
        'q1',
        '¿Puedo cancelar cuando quiera?',
        'a1',
        'Sí. No hay contratos: cambias de plan o cancelas desde tu panel y sigues con acceso hasta el fin del período pagado.',
    ],
    [
        'q2',
        '¿Qué pasa si supero mi cupo de alumnos?',
        'a2',
        'Subes al plan siguiente con un clic. No se borra nada: tus rutinas, historiales y alumnos se mantienen intactos.',
    ],
    [
        'q3',
        '¿Mis alumnos pagan algo por la app?',
        'a3',
        'No. Instalan tu app gratis y entran con un código de 5 dígitos. Tú pagas solo tu plan de coach.',
    ],
    [
        'q4',
        '¿Puedo migrar mis rutinas desde Excel?',
        'a4',
        'Sí. Cargas tu rutina una vez en el builder —con los {{count}} ejercicios del catálogo— y la reutilizas con todos los alumnos que quieras.',
    ],
    [
        'q5',
        '¿Necesito tarjeta para empezar?',
        'a5',
        'No. El plan Free es permanente para hasta 3 alumnos, sin tarjeta y con el builder completo.',
    ],
]

export function FaqSection({ exerciseCount }: { exerciseCount: number }) {
    const { t } = useLandingBrand()
    const lastIndex = FAQ_ITEMS.length - 1

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
                    {t('faq_mark', '// preguntas frecuentes')}
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
                    {t('faq_title', 'Antes de que preguntes.')}
                </h2>
            </div>

            <div
                data-reveal
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
                {FAQ_ITEMS.map(([qKey, qEs, aKey, aEs], i) => (
                    <details
                        key={qKey}
                        className="faq-i"
                        style={
                            i === lastIndex
                                ? undefined
                                : { borderBottom: '1px dashed rgba(255,255,255,0.09)' }
                        }
                    >
                        <summary
                            style={{
                                // display:flex suprime el triángulo en Blink/WebKit;
                                // listStyle:none lo suprime en Firefox → sin CSS externo.
                                display: 'flex',
                                listStyle: 'none',
                                cursor: 'pointer',
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
                                {t(qKey, qEs)}
                            </span>
                            <span
                                className="faq-x"
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
                            {t(aKey, aEs).replace('{{count}}', String(exerciseCount))}
                        </p>
                    </details>
                ))}
            </div>
        </section>
    )
}

export default FaqSection
