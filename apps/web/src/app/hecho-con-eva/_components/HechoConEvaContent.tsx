/**
 * `/hecho-con-eva` — el destino del sello «Hecho con EVA» (embudo Free→Pro, W5.1).
 *
 * POR QUÉ EXISTE ESTA PÁGINA Y NO LA HOME
 * El sello se pinta DENTRO de la app del alumno: shell `/c`, login del alumno, PDF de nutrición,
 * correos y export de RN — iOS incluido. Apuntaba a `/`, que monta `PreciosSection` con planes,
 * «Elegir Pro» y el ciclo de cobro: un toque desde la app y el usuario está mirando precios de una
 * suscripción que no se cobra por la tienda (guideline 3.1.1, el rechazo más caro que existe).
 *
 * Esta landing cuenta la misma historia SIN un solo número de plata: quién es EVA para el alumno
 * que llegó tocando el sello, y qué es EVA para el coach que quiere lo mismo. Un único CTA, a
 * `/register`. La venta —precio, oferta, link de pago— vive en correo y web, nunca acá.
 *
 * REGLA PARA QUIEN EDITE ESTE ARCHIVO: cero precios, cero «desde $», cero tabla de planes, cero
 * link a `#precios` o a `/pricing`. `hecho-con-eva.test.tsx` renderiza el árbol completo y lo
 * verifica; si agregás una sección de la landing, verificá que no arrastre precios con ella.
 *
 * Server component puro (0 estado propio). Las dos secciones reutilizadas de la landing v2
 * (`MarcaShowcase`, `CoachesProof`) ya estaban libres de precios y se montan tal cual.
 */

import type { CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Dumbbell, Salad, Smartphone, type LucideIcon } from 'lucide-react'
import { SALES_EMAIL } from '@/lib/brand-assets'
import MarcaShowcase from '@/components/landing-v2/MarcaShowcase'
import CoachesProof from '@/components/landing-v2/CoachesProof'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'

const kickerStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: '11px',
    letterSpacing: '0.18em',
    textTransform: 'lowercase',
    color: 'var(--brand)',
    fontWeight: 500,
    transition: 'color 0.2s linear',
}

const sectionStyle: CSSProperties = {
    position: 'relative',
    zIndex: 1,
    maxWidth: '1180px',
    margin: '0 auto',
}

const cardStyle: CSSProperties = {
    padding: '22px 24px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 8px 32px 0 rgba(0,0,0,0.37)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
}

const bodyStyle: CSSProperties = {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.65,
    color: '#D4D4D8',
    textWrap: 'pretty',
}

/** Lo que el alumno ya está usando sin saber que hay un motor detrás. */
const PARA_EL_ALUMNO: { Icon: LucideIcon; title: string; body: string }[] = [
    {
        Icon: Dumbbell,
        title: 'Tus entrenamientos',
        body: 'Tu coach arma tus rutinas serie por serie y las ve completarse en vivo. Los pesos, las repeticiones y tu progreso quedan guardados.',
    },
    {
        Icon: Salad,
        title: 'Tu alimentación',
        body: 'Si tu coach trabaja la nutrición, tu plan de comidas y tu registro diario viven en la misma app.',
    },
    {
        Icon: Smartphone,
        title: 'Con la marca de tu coach',
        body: 'El logo, el color y el nombre que ves son los de tu coach. EVA es el motor que corre detrás; tu relación es con quien te entrena.',
    },
]

export default function HechoConEvaContent({ exerciseCount }: { exerciseCount: number }) {
    return (
        <>
            {/*
             * Overrides responsive de ESTA página. `landing-v2.css` lista los ids de la home a mano
             * (`#marca`, `#coaches`, …) para el padding móvil, y su `footer` reserva 112 px abajo
             * para el CTA fijo que esta página no tiene. Van acá y no en el CSS compartido para no
             * tocar `/` por un layout que solo existe en `/hecho-con-eva`.
             */}
            <style>{`@media (max-width:640px){#landing-v2-root #para-coaches,#landing-v2-root #empezar{padding-left:18px!important;padding-right:18px!important;}#landing-v2-root header.hce-header{padding-left:18px!important;padding-right:18px!important;}#landing-v2-root footer.hce-footer{padding-bottom:40px!important;}}`}</style>

            {/* ── Encabezado mínimo. Sin nav: esta página se lee de arriba a abajo y tiene un solo
                camino de salida. Tampoco enlaza a `/` — la home lleva precios. ────────────────── */}
            <header
                className="hce-header"
                style={{
                    ...sectionStyle,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '22px 38px 0',
                }}
            >
                <Image
                    src="/LOGOS/eva-icon.png"
                    alt=""
                    width={22}
                    height={22}
                    style={{ width: 22, height: 22 }}
                />
                <span
                    style={{
                        fontFamily: 'var(--font-archivo), var(--font-montserrat), sans-serif',
                        fontWeight: 900,
                        fontSize: 16,
                        letterSpacing: '-0.04em',
                    }}
                >
                    EVA
                </span>
            </header>

            {/* ── Hero: le habla al ALUMNO que tocó el sello ──────────────────────────────────── */}
            <section id="top" style={{ ...sectionStyle, padding: '56px 38px 0' }}>
                <div
                    data-reveal
                    style={{
                        animationDelay: '0s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        maxWidth: '780px',
                    }}
                >
                    <span style={kickerStyle}>{'// hecho con eva'}</span>
                    <h1
                        style={{
                            fontFamily: DISPLAY,
                            fontWeight: 800,
                            fontSize: 'clamp(32px, 5vw, 58px)',
                            letterSpacing: '-0.04em',
                            lineHeight: 1.02,
                            margin: 0,
                            textWrap: 'balance',
                        }}
                    >
                        Tu coach usa EVA para entrenarte.
                    </h1>
                    <p
                        style={{
                            fontSize: '17px',
                            lineHeight: 1.55,
                            color: '#A1A1AA',
                            margin: 0,
                            maxWidth: '660px',
                            textWrap: 'pretty',
                        }}
                    >
                        Llegaste acá desde la app de tu coach. EVA es la plataforma sobre la que él o ella
                        arma tus rutinas, tu nutrición y tu seguimiento — y la app que usas todos los días
                        lleva su marca porque el trabajo es suyo. Nosotros ponemos el motor.
                    </p>
                    <p
                        style={{
                            fontSize: '14px',
                            lineHeight: 1.6,
                            color: '#8A8A93',
                            margin: 0,
                            maxWidth: '660px',
                            textWrap: 'pretty',
                        }}
                    >
                        No necesitas hacer nada acá: tu cuenta la administra tu coach y a EVA no le pagas
                        nada. Si tienes una duda de tu entrenamiento, habla con quien te entrena.
                    </p>
                </div>

                <div
                    data-reveal
                    className="r-social"
                    style={{
                        animationDelay: '0.08s',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '16px',
                        marginTop: '40px',
                    }}
                >
                    {PARA_EL_ALUMNO.map(({ Icon, title, body }) => (
                        <div key={title} style={cardStyle}>
                            <span
                                style={{
                                    color: 'var(--brand)',
                                    display: 'inline-flex',
                                    transition: 'color 0.2s linear',
                                }}
                            >
                                <Icon aria-hidden="true" />
                            </span>
                            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '17px', letterSpacing: '-0.02em' }}>
                                {title}
                            </span>
                            <p style={bodyStyle}>{body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Bisagra: acá cambia el interlocutor (alumno → coach) ────────────────────────── */}
            <section id="para-coaches" style={{ ...sectionStyle, padding: '96px 38px 0' }}>
                <div
                    data-reveal
                    style={{
                        animationDelay: '0s',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        gap: '14px',
                        maxWidth: '760px',
                        margin: '0 auto',
                    }}
                >
                    <span style={kickerStyle}>{'// y si el que entrena eres tú'}</span>
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
                        EVA es la app que tus alumnos verían con tu nombre.
                    </h2>
                    <p style={{ ...bodyStyle, fontSize: '15px', color: '#A1A1AA' }}>
                        Rutinas, nutrición, evaluaciones y check-ins en un solo panel — y una app para tus
                        alumnos con tu logo y tu color, no con el nuestro.
                    </p>
                </div>
            </section>

            {/* Centerpiece white-label de la landing (sin precios: la revisión de W5.1 lo verificó). */}
            <MarcaShowcase />

            {/* Hechos verificables del producto (sin testimonios, sin precios). */}
            <CoachesProof exerciseCount={exerciseCount} />

            {/* ── Único CTA de la página ──────────────────────────────────────────────────────── */}
            <section id="empezar" style={{ ...sectionStyle, padding: '90px 38px 0' }}>
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
                        WebkitBackdropFilter: 'blur(20px)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.37)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        gap: '14px',
                    }}
                >
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            top: '-90px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '320px',
                            height: '320px',
                            borderRadius: '50%',
                            background: 'rgb(var(--brand-rgb) / 0.16)',
                            filter: 'blur(90px)',
                            pointerEvents: 'none',
                            transition: 'background 0.5s ease',
                        }}
                    />
                    <h2
                        style={{
                            position: 'relative',
                            fontFamily: DISPLAY,
                            fontWeight: 800,
                            fontSize: 'clamp(24px, 3vw, 36px)',
                            letterSpacing: '-0.035em',
                            lineHeight: 1.08,
                            margin: 0,
                            textWrap: 'balance',
                        }}
                    >
                        Arma tu primera rutina hoy.
                    </h2>
                    <p style={{ ...bodyStyle, position: 'relative', color: '#A1A1AA', maxWidth: '520px' }}>
                        Creas tu cuenta, subes tu logo y tu primer alumno entra a tu app con un código de 5
                        dígitos. Sin tarjeta.
                    </p>
                    <Link
                        href="/register?tier=free"
                        className="lv2-cta-pill"
                        style={{
                            position: 'relative',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginTop: '6px',
                            padding: '14px 26px',
                            borderRadius: '9999px',
                            background: 'var(--brand)',
                            color: '#FFFFFF',
                            fontWeight: 600,
                            fontSize: '15px',
                            textDecoration: 'none',
                            boxShadow: '0 0 26px -4px rgb(var(--brand-rgb) / 0.75)',
                            transition: 'background 0.4s ease, box-shadow 0.4s ease',
                        }}
                    >
                        Crear mi cuenta de coach gratis →
                    </Link>
                </div>
            </section>

            {/* ── Footer mínimo. Sin «Precios» ni anclas de la home. ──────────────────────────── */}
            <footer
                className="hce-footer"
                style={{
                    ...sectionStyle,
                    marginTop: '90px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    padding: '30px 38px 40px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '18px',
                }}
            >
                <span style={{ fontFamily: MONO, fontSize: 10, color: '#8A8A93', letterSpacing: '0.1em' }}>
                    {'// eva · hecho en chile · © 2026'}
                </span>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <Link href="/legal" style={{ fontSize: 12, color: '#A1A1AA', textDecoration: 'none' }}>
                        Aviso legal
                    </Link>
                    <Link href="/privacidad" style={{ fontSize: 12, color: '#A1A1AA', textDecoration: 'none' }}>
                        Privacidad
                    </Link>
                    <a
                        href={`mailto:${SALES_EMAIL}`}
                        style={{ fontSize: 12, color: '#A1A1AA', textDecoration: 'none' }}
                    >
                        {SALES_EMAIL}
                    </a>
                </div>
            </footer>
        </>
    )
}
