'use client'

/**
 * ModulosPro — `#modulos` ("02 · módulos profesionales"). Sección H del spec de transcripción.
 * Fuente 1:1: nuevalandingv2/LandingPrism v2.dc.html (líneas 455-684).
 *
 * Client component: 4 tabs conmutan 4 paneles (useState local, 0-3). No consume el brand
 * provider (estado local de sección); usa `var(--brand)` / `rgb(var(--brand-rgb) / α)` literales
 * (los alimenta `#landing-v2-root`) y `data-reveal` para el observer global de reveal.
 *
 * Los 4 módulos = cardio / movement / body_composition / nutrición-Pro (intercambios), alineados
 * con MODULE_KEYS del catálogo real. Precio $9.990/mes uniforme self-service. Ver §6 del spec.
 */

import { useState, type CSSProperties } from 'react'
import {
  Activity,
  PersonStanding,
  Ruler,
  Salad,
  ShieldAlert,
  FileText,
  type LucideIcon,
} from 'lucide-react'

const MONO = 'var(--font-geist-mono), ui-monospace, monospace'
const DISPLAY = 'var(--font-montserrat), var(--font-inter), sans-serif'
const ARCHIVO = 'var(--font-archivo), var(--font-montserrat), sans-serif'

const stepNum: CSSProperties = {
  fontFamily: MONO,
  fontSize: '11px',
  color: 'var(--brand)',
  marginTop: '1px',
  transition: 'color 0.2s linear',
}

const stepText: CSSProperties = {
  fontSize: '13.5px',
  lineHeight: 1.5,
  color: '#D4D4D8',
}

const panelH3: CSSProperties = {
  fontFamily: DISPLAY,
  fontWeight: 800,
  fontSize: '26px',
  letterSpacing: '-0.03em',
  margin: 0,
}

const panelDesc: CSSProperties = {
  fontSize: '14px',
  lineHeight: 1.6,
  color: '#B4B4BB',
  margin: 0,
  textWrap: 'pretty',
}

const pillChip: CSSProperties = {
  fontFamily: MONO,
  fontSize: '10px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#8A8A93',
  padding: '5px 11px',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '9999px',
}

const vizCol: CSSProperties = {
  padding: '32px',
  background: 'rgba(0,0,0,0.22)',
  borderLeft: '1px solid rgba(255,255,255,0.06)',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
}

const textCol: CSSProperties = {
  padding: '38px 38px 34px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const modGrid = (active: boolean): CSSProperties => ({
  display: active ? 'grid' : 'none',
  gridTemplateColumns: '1fr 1.05fr',
  gap: 0,
})

/** Step 01/02/03 con `<strong>` embebido (color #fff) preservado del diseño. */
function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-start' }}>
      <span style={stepNum}>{n}</span>
      <span style={stepText}>{children}</span>
    </div>
  )
}

const TABS: { n: string; Icon: LucideIcon; title: string; sub: string }[] = [
  { n: '01', Icon: Activity, title: 'Cardio por zonas', sub: 'Prescripción cardiovascular' },
  { n: '02', Icon: PersonStanding, title: 'Evaluación de movimiento', sub: 'Screening de 7 patrones' },
  { n: '03', Icon: Ruler, title: 'Composición corporal', sub: 'Antropometría ISAK + BIA' },
  { n: '04', Icon: Salad, title: 'Nutrición por intercambios', sub: 'El método chileno, digital' },
]

export default function ModulosPro() {
  const [active, setActive] = useState(0)

  return (
    <section
      id="modulos"
      style={{
        position: 'relative',
        zIndex: 1,
        padding: '110px 38px 30px',
        maxWidth: '1180px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div
        data-reveal
        style={{
          animationDelay: '0s',
          maxWidth: '760px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          marginBottom: '36px',
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: '11px',
            letterSpacing: '0.18em',
            textTransform: 'lowercase',
            color: 'var(--brand)',
            fontWeight: 500,
            transition: 'color 0.2s linear',
          }}
        >
          // 02 · módulos profesionales
        </div>
        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 'clamp(30px, 3.8vw, 50px)',
            letterSpacing: '-0.035em',
            lineHeight: 1.05,
            margin: 0,
            textWrap: 'balance',
          }}
        >
          Las herramientas que usan los profesionales de verdad.
        </h2>
        <p
          style={{
            fontSize: '16px',
            lineHeight: 1.6,
            color: '#A1A1AA',
            maxWidth: '640px',
            margin: 0,
            textWrap: 'pretty',
          }}
        >
          Cada módulo reemplaza una herramienta que hoy haces a mano —en Excel, Canva o calculadora—
          y la convierte en algo automático, con tu marca y con historial. El coach mide y prescribe;
          el alumno solo ve su resultado.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            alignSelf: 'flex-start',
            marginTop: '4px',
            padding: '7px 14px',
            borderRadius: '9999px',
            background: 'rgb(var(--brand-rgb) / 0.08)',
            border: '1px solid rgb(var(--brand-rgb) / 0.28)',
          }}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--brand)',
              boxShadow: '0 0 8px var(--brand)',
              transition: 'background 0.3s linear',
            }}
          />
          <span
            style={{
              fontFamily: MONO,
              fontSize: '10.5px',
              letterSpacing: '0.08em',
              color: '#cfe3ff',
            }}
          >
            add-on · $9.990/mes c/u · enciende solo los que uses
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="r-modtabs"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}
      >
        {TABS.map((tab, i) => {
          const isActive = active === i
          return (
            <button
              key={tab.n}
              type="button"
              aria-pressed={isActive}
              onClick={() => setActive(i)}
              style={{
                all: 'unset',
                boxSizing: 'border-box',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '9px',
                padding: '18px',
                borderRadius: '18px',
                background: isActive ? 'rgb(var(--brand-rgb) / 0.06)' : 'rgba(255,255,255,0.025)',
                border: isActive ? '1.5px solid var(--brand)' : '1.5px solid rgba(255,255,255,0.10)',
                transition: 'background 0.3s ease, border-color 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: '11px',
                    fontWeight: 700,
                    color: isActive ? 'var(--brand)' : '#8A8A93',
                    transition: 'color 0.2s linear',
                  }}
                >
                  {tab.n}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    color: isActive ? 'var(--brand)' : '#8A8A93',
                    transition: 'color 0.2s linear',
                  }}
                >
                  <tab.Icon />
                </span>
              </div>
              <span
                style={{
                  fontFamily: DISPLAY,
                  fontWeight: 700,
                  fontSize: '15px',
                  letterSpacing: '-0.02em',
                  color: '#F8F9FA',
                }}
              >
                {tab.title}
              </span>
              <span style={{ fontSize: '11.5px', color: '#A1A1AA', lineHeight: 1.4 }}>{tab.sub}</span>
            </button>
          )
        })}
      </div>

      {/* Paneles */}
      <div
        data-reveal
        style={{
          animationDelay: '0.08s',
          marginTop: '16px',
          borderRadius: '24px',
          background: 'rgba(255,255,255,0.018)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 8px 32px 0 rgba(0,0,0,0.37)',
          overflow: 'hidden',
        }}
      >
        {/* ── modp-0 · Cardio por zonas ── */}
        <div id="modp-0" className="r-modgrid" style={modGrid(active === 0)}>
          <div style={textCol}>
            <h3 style={panelH3}>Cardio por zonas de frecuencia</h3>
            <p style={panelDesc}>
              Convierte el &quot;haz 30 minutos de trote&quot; en una prescripción real: zonas de
              esfuerzo calculadas para el cuerpo de cada alumno, no una tabla genérica.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Step n="01">
                Cargas la edad y el pulso del alumno una vez; EVA calcula sus{' '}
                <strong style={{ color: '#fff' }}>5 zonas personalizadas</strong>.
              </Step>
              <Step n="02">
                Prescribes por zona, ritmo (min/km) e intervalos: &quot;8×400 m en Z4, 90 s de
                pausa&quot;.
              </Step>
              <Step n="03">
                El alumno ve <strong style={{ color: '#fff' }}>&quot;Z4 · 150–168 ppm&quot;</strong>{' '}
                con cronómetro que lo guía, y registra lo que hizo.
              </Step>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              <span style={pillChip}>fórmulas Tanaka + Karvonen</span>
              <span style={pillChip}>running · ciclismo · crossfit</span>
            </div>
          </div>
          <div style={{ ...vizCol, gap: '11px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '4px',
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: '9.5px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: '#8A8A93',
                }}
              >
                // zonas de FC · alumno
              </span>
              <span style={{ fontFamily: MONO, fontSize: '9.5px', color: '#8A8A93' }}>
                FC máx 186
              </span>
            </div>
            {(
              [
                { label: 'Z1', color: '#3B82F6', w: '38%', range: '108–126' },
                { label: 'Z2', color: '#14B8A6', w: '54%', range: '126–144' },
                { label: 'Z3', color: '#22C55E', w: '68%', range: '144–150' },
                { label: 'Z4', color: '#F59E0B', w: '86%', range: '150–168', hi: true },
                { label: 'Z5', color: '#EF4444', w: '100%', range: '168–186' },
              ] as { label: string; color: string; w: string; range: string; hi?: boolean }[]
            ).map((z) => (
              <div
                key={z.label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '30px 1fr 74px',
                  gap: '11px',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: ARCHIVO,
                    fontWeight: 900,
                    fontSize: '15px',
                    color: z.color,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {z.label}
                </span>
                <div
                  style={{
                    height: z.hi ? '22px' : '16px',
                    borderRadius: '7px',
                    background: 'rgba(255,255,255,0.05)',
                    overflow: 'hidden',
                    ...(z.hi
                      ? { boxShadow: '0 0 16px -2px #F59E0B66', outline: '1.5px solid #F59E0B' }
                      : {}),
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: z.w,
                      borderRadius: '7px',
                      background: `linear-gradient(90deg, ${z.color}99, ${z.color})`,
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: '10.5px',
                    color: z.hi ? '#fff' : '#A1A1AA',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    ...(z.hi ? { fontWeight: 700 } : {}),
                  }}
                >
                  {z.range}
                </span>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                marginTop: '6px',
                padding: '9px 12px',
                borderRadius: '9px',
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.3)',
              }}
            >
              <span style={{ fontSize: '14px' }}>▶</span>
              <span style={{ fontSize: '11.5px', color: '#F5C04E' }}>
                8 × 400 m en <strong>Z4</strong> · pausa 90 s
              </span>
            </div>
          </div>
        </div>

        {/* ── modp-1 · Evaluación de movimiento ── */}
        <div id="modp-1" className="r-modgrid" style={modGrid(active === 1)}>
          <div style={textCol}>
            <h3 style={panelH3}>Evaluación de movimiento</h3>
            <p style={panelDesc}>
              Detecta dónde se mueve mal tu alumno y dónde tiene riesgo de lesión —antes de que se
              lesione. Lo que hace un kinesiólogo en una evaluación inicial.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Step n="01">
                Evalúas <strong style={{ color: '#fff' }}>7 patrones clave</strong> con nota 0–3;
                izquierda y derecha por separado.
              </Step>
              <Step n="02">
                EVA entrega un <strong style={{ color: '#fff' }}>semáforo de prioridad</strong>{' '}
                automático: rojo, amarillo o verde.
              </Step>
              <Step n="03">
                Cada evaluación queda guardada: ves la evolución con gráfico de línea y radar.
              </Step>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 13px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px dashed rgba(255,255,255,0.14)',
              }}
            >
              <span style={{ display: 'inline-flex', color: '#A1A1AA' }}>
                <ShieldAlert />
              </span>
              <span style={{ fontSize: '12px', lineHeight: 1.45, color: '#A1A1AA' }}>
                Herramienta de priorización, no diagnóstico médico. Para kinesiólogos y preparadores
                físicos.
              </span>
            </div>
          </div>
          <div style={{ ...vizCol, gap: '14px' }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '7px',
                  padding: '11px 9px',
                  borderRadius: '14px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span
                  style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#EF4444', opacity: 0.22 }}
                />
                <span
                  style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: '#F59E0B',
                    boxShadow: '0 0 14px 2px #F59E0B',
                  }}
                />
                <span
                  style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#22C55E', opacity: 0.22 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span
                  style={{
                    fontFamily: ARCHIVO,
                    fontWeight: 900,
                    fontSize: '22px',
                    letterSpacing: '-0.03em',
                    color: '#F59E0B',
                  }}
                >
                  Prioridad media
                </span>
                <span style={{ fontSize: '12px', color: '#A1A1AA' }}>
                  Puntaje 15/21 · asimetría en estocada
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {(
                [
                  { name: 'Sentadilla profunda', segs: ['#22C55E', '#22C55E', '#22C55E'] },
                  { name: 'Paso de valla', segs: ['#F59E0B', '#F59E0B', 'rgba(255,255,255,0.08)'] },
                  {
                    name: 'Estocada en línea',
                    tag: 'L≠R',
                    segs: ['#F59E0B', '#F59E0B', 'rgba(255,255,255,0.08)'],
                  },
                  { name: 'Movilidad de hombro', segs: ['#22C55E', '#22C55E', '#22C55E'] },
                  { name: 'Elevación activa de pierna', segs: ['#F59E0B', '#F59E0B', 'rgba(255,255,255,0.08)'] },
                  { name: 'Estabilidad de tronco', segs: ['#EF4444', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.08)'] },
                  { name: 'Estabilidad rotatoria', segs: ['#F59E0B', '#F59E0B', 'rgba(255,255,255,0.08)'] },
                ] as { name: string; tag?: string; segs: string[] }[]
              ).map((p) => (
                <div
                  key={p.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: '10px',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#D4D4D8' }}>{p.name}</span>
                  {p.tag ? (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '8.5px',
                        letterSpacing: '0.08em',
                        color: '#F5C04E',
                        background: 'rgba(245,158,11,0.12)',
                        padding: '2px 6px',
                        borderRadius: '5px',
                      }}
                    >
                      {p.tag}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span style={{ display: 'flex', gap: '3px' }}>
                    {p.segs.map((c, si) => (
                      <span
                        key={si}
                        style={{ width: '16px', height: '6px', borderRadius: '3px', background: c }}
                      />
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── modp-2 · Composición corporal ── */}
        <div id="modp-2" className="r-modgrid" style={modGrid(active === 2)}>
          <div style={textCol}>
            <h3 style={panelH3}>Composición corporal</h3>
            <p style={panelDesc}>
              Mide de qué está hecho el cuerpo —grasa, músculo, hueso— con rigor profesional, no solo
              &quot;subir a la pesa&quot;. Soporta los dos métodos de la industria.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Step n="01">
                <strong style={{ color: '#fff' }}>Bioimpedancia</strong> (InBody, Tanita, Omron) o{' '}
                <strong style={{ color: '#fff' }}>antropometría ISAK</strong> a mano.
              </Step>
              <Step n="02">
                8 pliegues, 8 perímetros y 6 diámetros → EVA calcula todo, sin errores de Excel.
              </Step>
              <Step n="03">
                Cuerpo en <strong style={{ color: '#fff' }}>5 componentes</strong> + somatotipo + %
                grasa, con historial antes/después.
              </Step>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
              <span style={pillChip}>Durnin · Yuhasz · Faulkner</span>
              <span style={pillChip}>nutricionistas · prep. físicos</span>
            </div>
          </div>
          <div style={{ ...vizCol, gap: '16px' }}>
            <div style={{ display: 'flex', gap: '7px' }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'var(--brand)',
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  background: 'rgb(var(--brand-rgb) / 0.12)',
                  border: '1px solid rgb(var(--brand-rgb) / 0.4)',
                  transition: 'color 0.2s linear',
                }}
              >
                ISAK
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: '10px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#A1A1AA',
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                }}
              >
                BIA
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: '9.5px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: '#8A8A93',
                }}
              >
                // fraccionamiento en 5 componentes · 78 kg
              </span>
              <div
                style={{
                  display: 'flex',
                  height: '30px',
                  borderRadius: '9px',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    width: '44%',
                    background: 'linear-gradient(90deg, var(--brand), rgb(var(--brand-rgb) / 0.7))',
                    transition: 'background 0.4s ease',
                  }}
                />
                <div style={{ width: '17%', background: '#F59E0B' }} />
                <div style={{ width: '16%', background: '#94A3B8' }} />
                <div style={{ width: '18%', background: '#64748B' }} />
                <div style={{ width: '5%', background: '#CBD5E1' }} />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '6px 14px',
                  marginTop: '4px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#D4D4D8' }}>
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '3px',
                      background: 'var(--brand)',
                      transition: 'background 0.4s ease',
                    }}
                  />
                  Muscular · 34,3 kg · 44%
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#D4D4D8' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#F59E0B' }} />
                  Grasa · 13,3 kg · 17%
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#D4D4D8' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#94A3B8' }} />
                  Ósea · 12,5 kg · 16%
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', color: '#D4D4D8' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#64748B' }} />
                  Residual · 14,0 kg · 18%
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <div
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: '11px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: '8.5px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#8A8A93',
                  }}
                >
                  somatotipo
                </div>
                <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: '15px', marginTop: '3px' }}>
                  Mesomorfo
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: '11px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: '8.5px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#8A8A93',
                  }}
                >
                  % grasa
                </div>
                <div
                  style={{
                    fontFamily: DISPLAY,
                    fontWeight: 800,
                    fontSize: '15px',
                    marginTop: '3px',
                    color: 'var(--brand)',
                    transition: 'color 0.2s linear',
                  }}
                >
                  17,1%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── modp-3 · Nutrición por intercambios ── */}
        <div id="modp-3" className="r-modgrid" style={modGrid(active === 3)}>
          <div style={textCol}>
            <h3 style={panelH3}>Nutrición por intercambios</h3>
            <p style={panelDesc}>
              Digitaliza el método de porciones que enseñan las universidades chilenas. El alumno
              cambia alimentos equivalentes solo, sin pesar todo en gramos.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Step n="01">
                Asignas porciones por comida con{' '}
                <strong style={{ color: '#fff' }}>9 grupos de intercambio</strong> chilenos.
              </Step>
              <Step n="02">
                EVA calcula calorías y macros solo, y arma variantes de día sin rehacer el plan.
              </Step>
              <Step n="03">
                Genera la pauta en <strong style={{ color: '#fff' }}>PDF con tu marca</strong> —tu
                logo y color, no el de EVA.
              </Step>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px', marginTop: '2px' }}>
              {['Cereales', 'Proteínas', 'Frutas', 'Verduras', 'Lácteos', 'Lípidos', 'Grasas', 'Scoop', 'Legumbres'].map(
                (g) => (
                  <span
                    key={g}
                    style={{
                      fontFamily: MONO,
                      fontSize: '10px',
                      color: '#A1A1AA',
                      padding: '4px 9px',
                      borderRadius: '7px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {g}
                  </span>
                ),
              )}
            </div>
          </div>
          <div style={{ ...vizCol, gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: '9.5px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: '#8A8A93',
                }}
              >
                // app del alumno
              </span>
              <span style={{ fontFamily: MONO, fontSize: '9.5px', color: '#8A8A93' }}>
                1.860 kcal · día entreno
              </span>
            </div>
            {(
              [
                {
                  meal: 'Desayuno',
                  kcal: '410 kcal',
                  chips: [
                    { t: '2 C', c: '#3B82F6' },
                    { t: '1 LÁC', c: '#22C55E' },
                    { t: '1 F', c: '#F59E0B' },
                  ],
                },
                {
                  meal: 'Almuerzo',
                  kcal: '620 kcal',
                  chips: [
                    { t: '3 C', c: '#3B82F6' },
                    { t: '2 PROT', c: '#EF4444' },
                    { t: '2 V', c: '#14B8A6' },
                    { t: '1 GR', c: '#A855F7' },
                  ],
                },
                {
                  meal: 'Once',
                  kcal: '380 kcal',
                  chips: [
                    { t: '2 C', c: '#3B82F6' },
                    { t: '1 LÁC', c: '#22C55E' },
                    { t: '1 SCOOP', c: '#EC4899' },
                  ],
                },
              ] as { meal: string; kcal: string; chips: { t: string; c: string }[] }[]
            ).map((m) => (
              <div
                key={m.meal}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px',
                  }}
                >
                  <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: '13px' }}>
                    {m.meal}
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: '10px',
                      color: '#8A8A93',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {m.kcal}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {m.chips.map((chip) => (
                    <span
                      key={chip.t}
                      style={{
                        fontFamily: MONO,
                        fontSize: '10.5px',
                        fontWeight: 600,
                        color: chip.c,
                        padding: '3px 9px',
                        borderRadius: '7px',
                        background: `${chip.c}1f`,
                        border: `1px solid ${chip.c}55`,
                      }}
                    >
                      {chip.t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                marginTop: '2px',
                padding: '11px 13px',
                borderRadius: '11px',
                background: 'rgb(var(--brand-rgb) / 0.08)',
                border: '1px solid rgb(var(--brand-rgb) / 0.3)',
                transition: 'background 0.4s ease, border-color 0.4s ease',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px',
                  borderRadius: '7px',
                  background: 'var(--brand)',
                  color: '#fff',
                  transition: 'background 0.4s ease',
                }}
              >
                <FileText />
              </span>
              <span style={{ fontSize: '11.5px', lineHeight: 1.4, color: '#cfe3ff' }}>
                Pauta en <strong style={{ color: '#fff' }}>PDF con tu marca</strong> — logo, color y
                nombre del centro.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
