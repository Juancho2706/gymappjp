'use client'

/**
 * PreciosSection — `#precios` (§I del spec de transcripción landing-v2).
 *
 * Fidelidad 1:1 con `nuevalandingv2/LandingPrism v2.dc.html` (líneas 686-755) en
 * estructura/estilos/responsive, PERO con DATOS REALES:
 *  - Precios computados en vivo desde `@eva/tiers` (NO los números del diseño).
 *  - Equivalente mensual = round(total período / meses) — mismo cálculo que
 *    `LandingPricingPreview.tsx`.
 *  - Rango Elite = 31–100 (maxClients real), NO el 31–60 del diseño. Se deriva de
 *    `getTierMaxClients` en AMBOS idiomas → corrige también el `pe_1` (31–60) que
 *    quedó stale en `copy.ts`/EN_DICT.
 *  - CTAs → `/register?tier=<id>&cycle=<ciclo activo>` (Free → `/register`).
 *
 * Estado transversal desde el provider (§7): `t` (i18n), `cycle`/`setCycle` (ciclo
 * compartido 'm'|'q'|'a'). El color de marca llega por CSS (`var(--brand)`), sin JS.
 * Hovers de los CTA (`style-hover` del diseño) → `onMouseEnter/Leave` + estado; el
 * `translateY(-2px)` del CTA brand se desactiva bajo `prefers-reduced-motion`.
 *
 * El bullet 3 de Free ("Catálogo de N ejercicios con GIF") usa el `exerciseCount` REAL
 * (mismo dato que ModulosSection, pasado como prop desde `page.tsx`) vía el placeholder
 * `{{count}}` — ya no el "818" mock del diseño, para no mentir el tamaño del catálogo.
 */

import Link from 'next/link'
import { type CSSProperties, useEffect, useState } from 'react'
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

// Ciclo del provider ('m'|'q'|'a') → BillingCycle de @eva/tiers.
const CYCLE_MAP = { m: 'monthly', q: 'quarterly', a: 'annual' } as const satisfies Record<
    string,
    BillingCycle
>

function fmtClp(n: number) {
    return `$${n.toLocaleString('es-CL')}`
}

/** Escucha `prefers-reduced-motion` en vivo (SSR-safe: arranca en false). */
function useReducedMotion() {
    const [reduce, setReduce] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setReduce(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])
    return reduce
}

export function PreciosSection({ exerciseCount }: { exerciseCount: number }) {
    const { t, lang, cycle, setCycle } = useLandingBrand()
    const reduce = useReducedMotion()
    const [hovered, setHovered] = useState<string | null>(null)

    const billing: BillingCycle = CYCLE_MAP[cycle]

    const monthlyEquiv = (tier: 'pro' | 'elite') => {
        const total = getTierPriceClp(tier, billing)
        return billing === 'monthly'
            ? total
            : Math.round(total / BILLING_CYCLE_CONFIG[billing].months)
    }

    const proPrice = fmtClp(monthlyEquiv('pro'))
    const elitePrice = fmtClp(monthlyEquiv('elite'))

    // Rango de alumnos por idioma, derivado del maxClients real (NO del EN_DICT stale).
    const rangeLabel = (lo: number | null, hi: number) => {
        if (lang === 'en') {
            return lo == null ? `Up to ${hi} active clients` : `${lo}–${hi} active clients`
        }
        return lo == null ? `Hasta ${hi} alumnos activos` : `${lo}–${hi} alumnos activos`
    }

    // CTA glass (Free / Elite): hover sube el fondo 0.04 → 0.08.
    const ghostCta = (key: string): CSSProperties => ({
        marginTop: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '11px 20px',
        borderRadius: '9999px',
        background: hovered === key ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
        color: '#F8F9FA',
        border: '1px solid rgba(255,255,255,0.12)',
        fontWeight: 600,
        fontSize: 13,
        textDecoration: 'none',
        transition: 'background 0.25s ease',
    })

    const hoverHandlers = (key: string) => ({
        onMouseEnter: () => setHovered(key),
        onMouseLeave: () => setHovered((h) => (h === key ? null : h)),
        onFocus: () => setHovered(key),
        onBlur: () => setHovered((h) => (h === key ? null : h)),
    })

    const cycleBtn = (key: 'm' | 'q' | 'a', label: string) => {
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
                    {t('s3_mark', '// 03 · precios')}
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
                    {t('s3_title', 'Paga por cupo de alumnos.')}
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
                    {t(
                        's3_lede',
                        'Sin contratos. Cambia o cancela cuando quieras. Ahorra hasta 20% con prepago anual.'
                    )}
                </p>

                <div
                    className="r-cyc"
                    role="group"
                    aria-label="Ciclo de facturación"
                    style={{
                        display: 'inline-flex',
                        padding: 4,
                        borderRadius: '9999px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        marginTop: 8,
                    }}
                >
                    {cycleBtn('m', t('cyc_m', 'Mensual'))}
                    {cycleBtn('q', t('cyc_q', 'Trimestral −10%'))}
                    {cycleBtn('a', t('cyc_a', 'Anual −20%'))}
                </div>

                <div
                    style={{
                        fontFamily: FONT_MONO,
                        fontSize: 10,
                        color: '#8A8A93',
                        letterSpacing: '0.1em',
                    }}
                >
                    {t('cyc_note', '// equivalente mensual · facturado por período · clp')}
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
                    <div style={planKicker}>{'// free'}</div>
                    <h3 style={planName}>Free</h3>
                    <p style={planSub}>
                        {t('pf_sub', 'Prueba EVA sin tarjeta. Hasta 3 alumnos, para siempre.')}
                    </p>
                    <div style={priceRow}>
                        <span style={priceNum}>$0</span>
                        <span style={priceUnit}>{t('p_unit', 'clp / mes')}</span>
                    </div>
                    <ul style={featureList}>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {rangeLabel(null, FREE_HI)}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t('pf_2', 'Builder de rutinas completo')}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t('pf_3', 'Catálogo de {{count}} ejercicios con GIF').replace(
                                '{{count}}',
                                String(exerciseCount),
                            )}
                        </li>
                        <li style={{ ...liStyle, color: '#8A8A93' }}>
                            <span style={{ color: '#8A8A93' }}>✗</span>
                            {t('pf_4', 'Sin módulo de nutrición')}
                        </li>
                        <li style={{ ...liStyle, color: '#8A8A93' }}>
                            <span style={{ color: '#8A8A93' }}>✗</span>
                            {t('pf_5', 'Sin módulos profesionales')}
                        </li>
                    </ul>
                    <Link href="/register" style={ghostCta('free')} {...hoverHandlers('free')}>
                        {t('pf_cta', 'Empezar gratis')}
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
                        {t('badge_pop', 'más popular')}
                    </div>
                    <div
                        style={{
                            ...planKicker,
                            position: 'relative',
                            color: 'var(--brand)',
                            transition: 'color 0.2s linear',
                        }}
                    >
                        {'// pro'}
                    </div>
                    <h3 style={{ ...planName, position: 'relative' }}>Pro</h3>
                    <p style={{ ...planSub, position: 'relative' }}>
                        {t('pp_sub', 'El equilibrio habitual: más cupos y nutrición incluida.')}
                    </p>
                    <div style={{ ...priceRow, position: 'relative' }}>
                        <span data-price="pro" style={priceNum}>
                            {proPrice}
                        </span>
                        <span style={priceUnit}>{t('p_unit', 'clp / mes')}</span>
                    </div>
                    <ul style={{ ...featureList, position: 'relative' }}>
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {rangeLabel(PRO_LO, PRO_HI)}
                        </li>
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {t('pp_2', 'Planes de nutrición incluidos')}
                        </li>
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {t('pp_3', 'White-label: tu logo y tu color')}
                        </li>
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {t('pp_4', 'Check-ins, progreso y alertas')}
                        </li>
                        <li style={liStyle}>
                            <span style={brandCheck}>✓</span>
                            {t('pp_5', '4 módulos profesionales incluidos')}
                        </li>
                    </ul>
                    <Link
                        href={`/register?tier=pro&cycle=${billing}`}
                        {...hoverHandlers('pro')}
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
                            transform:
                                hovered === 'pro' && !reduce ? 'translateY(-2px)' : 'none',
                            transition:
                                'transform 0.3s ease, background 0.4s ease, box-shadow 0.4s ease',
                        }}
                    >
                        {t('pp_cta', 'Elegir Pro →')}
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
                    <div style={planKicker}>{'// elite'}</div>
                    <h3 style={planName}>Elite</h3>
                    <p style={planSub}>
                        {t('pe_sub', 'Para negocios consolidados con alto volumen de alumnos.')}
                    </p>
                    <div style={priceRow}>
                        <span data-price="elite" style={priceNum}>
                            {elitePrice}
                        </span>
                        <span style={priceUnit}>{t('p_unit', 'clp / mes')}</span>
                    </div>
                    <ul style={featureList}>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {rangeLabel(ELITE_LO, ELITE_HI)}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t('pe_2', 'Todo lo de Pro, con más cupos')}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t('pe_3', 'Descuentos por prepago anual')}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t('pe_4', 'Soporte prioritario')}
                        </li>
                        <li style={liStyle}>
                            <span style={{ color: '#4ADE80' }}>✓</span>
                            {t('pe_5', '4 módulos profesionales incluidos')}
                        </li>
                    </ul>
                    <Link
                        href={`/register?tier=elite&cycle=${billing}`}
                        style={ghostCta('elite')}
                        {...hoverHandlers('elite')}
                    >
                        {t('pe_cta', 'Elegir Elite')}
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
                {t(
                    'table_note',
                    '// también: starter (1–10) · growth (61–120) · scale (hasta 500) — todos con rutinas ilimitadas y dashboard'
                )}
            </div>
        </section>
    )
}

// ── Estilos compartidos entre las 3 cards ────────────────────────────────────
const planKicker: CSSProperties = {
    fontFamily: FONT_MONO,
    fontSize: 10.5,
    color: '#A1A1AA',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    fontWeight: 600,
}

const planName: CSSProperties = {
    fontFamily: FONT_DISPLAY,
    fontWeight: 800,
    fontSize: 26,
    letterSpacing: '-0.03em',
    margin: '6px 0 4px',
}

const planSub: CSSProperties = {
    fontSize: 13,
    color: '#A1A1AA',
    margin: '0 0 20px',
    lineHeight: 1.5,
}

const priceRow: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 22,
}

const priceNum: CSSProperties = {
    fontFamily: FONT_NUM,
    fontWeight: 900,
    fontSize: 46,
    letterSpacing: '-0.045em',
    lineHeight: 0.9,
    fontVariantNumeric: 'tabular-nums',
}

const priceUnit: CSSProperties = {
    fontFamily: FONT_MONO,
    fontSize: 11,
    color: '#8A8A93',
    letterSpacing: '0.05em',
}

const featureList: CSSProperties = {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
}

const liStyle: CSSProperties = {
    display: 'flex',
    gap: 8,
    fontSize: 13,
    color: '#D4D4D8',
    lineHeight: 1.5,
}

const brandCheck: CSSProperties = {
    color: 'var(--brand)',
    transition: 'color 0.2s linear',
}

export default PreciosSection
