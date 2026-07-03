'use client'

/**
 * PreciosSection — `#precios` (§I del spec de transcripción landing-v2).
 *
 * Fidelidad 1:1 con `nuevalandingv2/LandingPrism v2.dc.html` (líneas 686-755) en
 * estructura/estilos/responsive, PERO con DATOS REALES:
 *  - Precios computados en vivo desde `@eva/tiers` (NO los números del diseño).
 *  - Equivalente mensual = round(total período / meses) — mismo cálculo que
 *    `LandingPricingPreview.tsx`.
 *  - Rango Elite = 31–100 (maxClients real), NO el 31–60 del diseño.
 *  - CTAs → `/register?tier=<id>&cycle=<ciclo activo>` (Free → `/register`).
 *
 * Decisiones documentadas:
 *  - `cycle` es estado LOCAL (§I: ninguna otra sección lo usa hoy → aceptable local).
 *  - i18n: lee `lang` del provider compartido; copy ES/EN local a la sección.
 *  - "818 ejercicios" (Free · bullet 3) se mantiene como número de marketing del diseño:
 *    PreciosSection no recibe `exerciseCount` por contrato (§7). Discrepancia 818 vs count
 *    real ~129 → decisión de negocio pendiente (§8.1). Si se resuelve usar el real, se
 *    agrega una prop.
 */

import Link from 'next/link'
import { useState } from 'react'
import {
    type BillingCycle,
    getTierPriceClp,
    getTierMaxClients,
    BILLING_CYCLE_CONFIG,
} from '@eva/tiers'
import { useLandingBrand } from './_brand-provider'

const FONT_MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const FONT_DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'
const FONT_NUM = 'var(--font-archivo), var(--font-montserrat), sans-serif'

// Rangos derivados de la fuente REAL (@eva/tiers) — corrige el 31–60 del diseño a 31–100.
const FREE_HI = getTierMaxClients('free') // 3
const PRO_LO = getTierMaxClients('starter') + 1 // 11
const PRO_HI = getTierMaxClients('pro') // 30
const ELITE_LO = getTierMaxClients('pro') + 1 // 31
const ELITE_HI = getTierMaxClients('elite') // 100

const COPY = {
    es: {
        mark: '// 03 · precios',
        title: 'Paga por cupo de alumnos.',
        lede: 'Sin contratos. Cambia o cancela cuando quieras. Ahorra hasta 20% con prepago anual.',
        cycM: 'Mensual',
        cycQ: 'Trimestral −10%',
        cycA: 'Anual −20%',
        cycGroup: 'Ciclo de facturación',
        cycNote: '// equivalente mensual · facturado por período · clp',
        unit: 'clp / mes',
        free: '// free',
        freeSub: 'Prueba EVA sin tarjeta. Hasta 3 alumnos, para siempre.',
        freeR: `Hasta ${FREE_HI} alumnos activos`,
        free2: 'Builder de rutinas completo',
        free3: 'Catálogo de 818 ejercicios con GIF',
        free4: 'Sin módulo de nutrición',
        freeCta: 'Empezar gratis',
        pop: 'más popular',
        pro: '// pro',
        proSub: 'El equilibrio habitual: más cupos y nutrición incluida.',
        proR: `${PRO_LO}–${PRO_HI} alumnos activos`,
        pro2: 'Planes de nutrición incluidos',
        pro3: 'White-label: tu logo y tu color',
        pro4: 'Check-ins, progreso y alertas',
        proCta: 'Elegir Pro →',
        elite: '// elite',
        eliteSub: 'Para negocios consolidados con alto volumen de alumnos.',
        eliteR: `${ELITE_LO}–${ELITE_HI} alumnos activos`,
        elite2: 'Todo lo de Pro, con más cupos',
        elite3: 'Descuentos por prepago anual',
        elite4: 'Soporte prioritario',
        eliteCta: 'Elegir Elite',
        note: '// también: starter (1–10) · growth (61–120) · scale (hasta 500) — todos con rutinas ilimitadas y dashboard',
    },
    en: {
        mark: '// 02 · pricing',
        title: 'Pay per client slot.',
        lede: 'No contracts. Change or cancel anytime. Save up to 20% with annual prepay.',
        cycM: 'Monthly',
        cycQ: 'Quarterly −10%',
        cycA: 'Annual −20%',
        cycGroup: 'Billing cycle',
        cycNote: '// monthly equivalent · billed per period · clp',
        unit: 'clp / mo',
        free: '// free',
        freeSub: 'Try EVA without a card. Up to 3 clients, forever.',
        freeR: `Up to ${FREE_HI} active clients`,
        free2: 'Full routine builder',
        free3: '818-exercise GIF catalog',
        free4: 'No nutrition module',
        freeCta: 'Start free',
        pop: 'most popular',
        pro: '// pro',
        proSub: 'The usual sweet spot: more slots and nutrition included.',
        proR: `${PRO_LO}–${PRO_HI} active clients`,
        pro2: 'Nutrition plans included',
        pro3: 'White-label: your logo and color',
        pro4: 'Check-ins, progress and alerts',
        proCta: 'Choose Pro →',
        elite: '// elite',
        eliteSub: 'For established businesses with high client volume.',
        eliteR: `${ELITE_LO}–${ELITE_HI} active clients`,
        elite2: 'Everything in Pro, more slots',
        elite3: 'Annual prepay discounts',
        elite4: 'Priority support',
        eliteCta: 'Choose Elite',
        note: '// also: starter (1–10) · growth (61–120) · scale (up to 500) — all with unlimited routines and dashboard',
    },
} as const

function fmtClp(n: number) {
    return `$${n.toLocaleString('es-CL')}`
}

export function PreciosSection() {
    const { lang } = useLandingBrand()
    const t = COPY[lang === 'en' ? 'en' : 'es']
    const [cycle, setCycle] = useState<BillingCycle>('monthly')

    const monthlyEquiv = (tier: 'pro' | 'elite') => {
        const total = getTierPriceClp(tier, cycle)
        return cycle === 'monthly'
            ? total
            : Math.round(total / BILLING_CYCLE_CONFIG[cycle].months)
    }

    const proPrice = fmtClp(monthlyEquiv('pro'))
    const elitePrice = fmtClp(monthlyEquiv('elite'))

    const cycleBtn = (
        key: BillingCycle,
        label: string
    ) => {
        const active = cycle === key
        return (
            <button
                type="button"
                onClick={() => setCycle(key)}
                aria-pressed={active}
                style={{
                    appearance: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: '7px 16px',
                    borderRadius: '9999px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: active ? '#FFFFFF' : '#A1A1AA',
                    background: active ? 'var(--brand)' : 'transparent',
                    transition: 'background 0.3s ease, color 0.3s ease',
                }}
            >
                {label}
            </button>
        )
    }

    return (
        <section
            id="precios"
            aria-labelledby="precios-title"
            style={{
                position: 'relative',
                zIndex: 1,
                padding: '110px 38px 60px',
                maxWidth: 1180,
                margin: '0 auto',
            }}
        >
            {/* Header + toggle de ciclo */}
            <div
                data-reveal
                style={{
                    animationDelay: '0s',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    alignItems: 'center',
                    marginBottom: 40,
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
                    id="precios-title"
                    style={{
                        fontFamily: FONT_DISPLAY,
                        fontWeight: 800,
                        fontSize: 'clamp(30px, 3.8vw, 50px)',
                        letterSpacing: '-0.035em',
                        lineHeight: 1.05,
                        margin: 0,
                    }}
                >
                    {t.title}
                </h2>
                <p
                    style={{
                        fontSize: 15,
                        lineHeight: 1.55,
                        color: '#A1A1AA',
                        maxWidth: 540,
                        margin: 0,
                        textWrap: 'pretty',
                    }}
                >
                    {t.lede}
                </p>

                <div
                    className="r-cyc"
                    role="group"
                    aria-label={t.cycGroup}
                    style={{
                        display: 'inline-flex',
                        padding: 4,
                        borderRadius: '9999px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        marginTop: 8,
                    }}
                >
                    {cycleBtn('monthly', t.cycM)}
                    {cycleBtn('quarterly', t.cycQ)}
                    {cycleBtn('annual', t.cycA)}
                </div>

                <div
                    style={{
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                        color: '#8A8A93',
                        letterSpacing: '0.1em',
                    }}
                >
                    {t.cycNote}
                </div>
            </div>

            {/* Cards */}
            <div
                className="r-price"
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 16,
                    maxWidth: 1020,
                    margin: '0 auto',
                }}
            >
                {/* FREE */}
                <div
                    data-reveal
                    style={{
                        animationDelay: '0s',
                        position: 'relative',
                        padding: '28px 26px',
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 22,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <div
                        style={{
                            fontFamily: FONT_MONO,
                            fontSize: 10.5,
                            color: '#A1A1AA',
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                        }}
                    >
                        {t.free}
                    </div>
                    <h3
                        style={{
                            fontFamily: FONT_DISPLAY,
                            fontWeight: 800,
                            fontSize: 26,
                            letterSpacing: '-0.03em',
                            margin: '6px 0 4px',
                        }}
                    >
                        Free
                    </h3>
                    <p
                        style={{
                            fontSize: 13,
                            color: '#A1A1AA',
                            margin: '0 0 20px',
                            lineHeight: 1.5,
                        }}
                    >
                        {t.freeSub}
                    </p>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 8,
                            marginBottom: 22,
                        }}
                    >
                        <span
                            style={{
                                fontFamily: FONT_NUM,
                                fontWeight: 900,
                                fontSize: 46,
                                letterSpacing: '-0.045em',
                                lineHeight: 0.9,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            $0
                        </span>
                        <span
                            style={{
                                fontFamily: FONT_MONO,
                                fontSize: 11,
                                color: '#8A8A93',
                                letterSpacing: '0.05em',
                            }}
                        >
                            {t.unit}
                        </span>
                    </div>
                    <ul
                        style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: '0 0 24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t.freeR}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t.free2}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t.free3}
                        </li>
                        <li style={{ ...liStyle, color: '#8A8A93' }}>
                            <span style={{ color: '#8A8A93' }}>✗</span>
                            {t.free4}
                        </li>
                    </ul>
                    <Link
                        href="/register"
                        className="lv2-ghostbtn"
                        style={{
                            marginTop: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '11px 20px',
                            borderRadius: '9999px',
                            color: '#F8F9FA',
                            border: '1px solid rgba(255,255,255,0.12)',
                            fontWeight: 600,
                            fontSize: 13,
                            textDecoration: 'none',
                        }}
                    >
                        {t.freeCta}
                    </Link>
                </div>

                {/* PRO (destacada) */}
                <div
                    data-reveal
                    style={{
                        animationDelay: '0.08s',
                        position: 'relative',
                        padding: '28px 26px',
                        background: 'rgb(var(--brand-rgb) / 0.06)',
                        border: '1px solid rgb(var(--brand-rgb) / 0.4)',
                        borderRadius: 22,
                        boxShadow:
                            '0 0 44px -10px rgb(var(--brand-rgb) / 0.4), 0 8px 32px rgba(0,0,0,0.37)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        transition:
                            'background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease',
                    }}
                >
                    <div
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            top: -60,
                            right: -60,
                            width: 200,
                            height: 200,
                            borderRadius: '50%',
                            background: 'rgb(var(--brand-rgb) / 0.18)',
                            filter: 'blur(80px)',
                            pointerEvents: 'none',
                            transition: 'background 0.5s ease',
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: 18,
                            right: 18,
                            padding: '3px 9px',
                            borderRadius: 99,
                            background: 'var(--brand)',
                            fontFamily: FONT_MONO,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                            color: '#fff',
                            transition: 'background 0.4s ease',
                        }}
                    >
                        {t.pop}
                    </div>
                    <div
                        style={{
                            position: 'relative',
                            fontFamily: FONT_MONO,
                            fontSize: 10.5,
                            color: 'var(--brand)',
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            transition: 'color 0.2s linear',
                        }}
                    >
                        {t.pro}
                    </div>
                    <h3
                        style={{
                            position: 'relative',
                            fontFamily: FONT_DISPLAY,
                            fontWeight: 800,
                            fontSize: 26,
                            letterSpacing: '-0.03em',
                            margin: '6px 0 4px',
                        }}
                    >
                        Pro
                    </h3>
                    <p
                        style={{
                            position: 'relative',
                            fontSize: 13,
                            color: '#A1A1AA',
                            margin: '0 0 20px',
                            lineHeight: 1.5,
                        }}
                    >
                        {t.proSub}
                    </p>
                    <div
                        style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 8,
                            marginBottom: 22,
                        }}
                    >
                        <span
                            data-price="pro"
                            style={{
                                fontFamily: FONT_NUM,
                                fontWeight: 900,
                                fontSize: 46,
                                letterSpacing: '-0.045em',
                                lineHeight: 0.9,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            {proPrice}
                        </span>
                        <span
                            style={{
                                fontFamily: FONT_MONO,
                                fontSize: 11,
                                color: '#8A8A93',
                                letterSpacing: '0.05em',
                            }}
                        >
                            {t.unit}
                        </span>
                    </div>
                    <ul
                        style={{
                            position: 'relative',
                            listStyle: 'none',
                            padding: 0,
                            margin: '0 0 24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {t.proR}
                        </li>
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {t.pro2}
                        </li>
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {t.pro3}
                        </li>
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {t.pro4}
                        </li>
                    </ul>
                    <Link
                        href={`/register?tier=pro&cycle=${cycle}`}
                        className="lv2-brandbtn"
                        style={{
                            position: 'relative',
                            marginTop: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '12px 20px',
                            borderRadius: '9999px',
                            background: 'var(--brand)',
                            color: '#fff',
                            fontWeight: 600,
                            fontSize: 13.5,
                            textDecoration: 'none',
                            boxShadow: '0 0 22px -4px var(--brand)',
                        }}
                    >
                        {t.proCta}
                    </Link>
                </div>

                {/* ELITE */}
                <div
                    data-reveal
                    style={{
                        animationDelay: '0.16s',
                        position: 'relative',
                        padding: '28px 26px',
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 22,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                        display: 'flex',
                        flexDirection: 'column',
                    }}
                >
                    <div
                        style={{
                            fontFamily: FONT_MONO,
                            fontSize: 10.5,
                            color: '#A1A1AA',
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                        }}
                    >
                        {t.elite}
                    </div>
                    <h3
                        style={{
                            fontFamily: FONT_DISPLAY,
                            fontWeight: 800,
                            fontSize: 26,
                            letterSpacing: '-0.03em',
                            margin: '6px 0 4px',
                        }}
                    >
                        Elite
                    </h3>
                    <p
                        style={{
                            fontSize: 13,
                            color: '#A1A1AA',
                            margin: '0 0 20px',
                            lineHeight: 1.5,
                        }}
                    >
                        {t.eliteSub}
                    </p>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: 8,
                            marginBottom: 22,
                        }}
                    >
                        <span
                            data-price="elite"
                            style={{
                                fontFamily: FONT_NUM,
                                fontWeight: 900,
                                fontSize: 46,
                                letterSpacing: '-0.045em',
                                lineHeight: 0.9,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            {elitePrice}
                        </span>
                        <span
                            style={{
                                fontFamily: FONT_MONO,
                                fontSize: 11,
                                color: '#8A8A93',
                                letterSpacing: '0.05em',
                            }}
                        >
                            {t.unit}
                        </span>
                    </div>
                    <ul
                        style={{
                            listStyle: 'none',
                            padding: 0,
                            margin: '0 0 24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t.eliteR}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t.elite2}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t.elite3}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t.elite4}
                        </li>
                    </ul>
                    <Link
                        href={`/register?tier=elite&cycle=${cycle}`}
                        className="lv2-ghostbtn"
                        style={{
                            marginTop: 'auto',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '11px 20px',
                            borderRadius: '9999px',
                            color: '#F8F9FA',
                            border: '1px solid rgba(255,255,255,0.12)',
                            fontWeight: 600,
                            fontSize: 13,
                            textDecoration: 'none',
                        }}
                    >
                        {t.eliteCta}
                    </Link>
                </div>
            </div>

            <div
                style={{
                    maxWidth: 1020,
                    margin: '16px auto 0',
                    textAlign: 'center',
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    color: '#8A8A93',
                    letterSpacing: '0.1em',
                }}
            >
                {t.note}
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

const liStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    fontSize: 13,
    color: '#D4D4D8',
    lineHeight: 1.5,
}

const brandCheck: React.CSSProperties = {
    color: 'var(--brand)',
    transition: 'color 0.2s linear',
}
