'use client'

import type { CSSProperties } from 'react'
import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import { Moon, Sun } from 'lucide-react'
import { AuroraAppComponentDemos } from '@/app/aurora/components/AuroraAppComponentDemos'
import { AuroraCoachColorControls } from '@/app/aurora/components/AuroraCoachColorControls'
import { AURORA_COLOR_PRESETS, coachSecondaryForTheme, hexToRgbString, hexToRgba } from '@/app/aurora/lib/aurora-brand'
import './aurora.css'

type PageTheme = 'light' | 'dark'

function ScreenLabel({
  num,
  title,
  theme,
}: {
  num: string
  title: string
  theme: PageTheme
}) {
  return (
    <div className="screen-label">
      <span className="num">{num}</span>
      <span className="title">{title}</span>
      <span className={theme === 'light' ? 'mode light' : 'mode dark'}>
        {theme === 'light' ? '☀ CLARO' : '☾ OSCURO'}
      </span>
    </div>
  )
}

function PhoneFrame({
  children,
  glow,
  mode,
}: {
  children: React.ReactNode
  glow: string
  mode: 'light' | 'dark'
}) {
  return (
    <div className="phone-wrap" style={{ ['--glow-color' as string]: glow }}>
      <div className={`phone ${mode}`}>
        <div className="dynamic-island" aria-hidden />
        <div className="phone-screen">{children}</div>
      </div>
    </div>
  )
}

function StatusBar() {
  return (
    <div className="status-bar">
      <span>9:41</span>
      <div className="right">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 4a8 8 0 0 1 8 8h2a10 10 0 0 0-10-10v2Z" />
          <path d="M12 8a4 4 0 0 1 4 4h2a6 6 0 0 0-6-6v2Z" />
          <circle cx="12" cy="12" r="2" />
        </svg>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="2" y="8" width="20" height="10" rx="2" />
        </svg>
      </div>
    </div>
  )
}

function StudentDashboard({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <StatusBar />
      <div className="sd-top">
        <div className="sd-greet-chip aurora-glass">
          <div className="avatar">R</div>
          Con Rodrigo
        </div>
        <div className="sd-bell aurora-glass">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10 21h4" />
          </svg>
        </div>
      </div>
      <div className="sd-title">
        <div className="date">Lunes, 18 Abr</div>
        <h2>
          Hola Camila,
          <br />
          toca <span className="accent">push day</span>.
        </h2>
      </div>
      <div className="wo-hero">
        <span className="chip">Semana 3 · Día 1</span>
        <h3>Push Day</h3>
        <div className="desc">Pecho, hombro y tríceps. Terminas con movilidad.</div>
        <div className="facts">
          <div className="fact">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <rect x="3" y="9" width="4" height="6" />
              <rect x="17" y="9" width="4" height="6" />
              <rect x="7" y="11" width="10" height="2" />
            </svg>
            6 ej
          </div>
          <div className="fact">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            ~58 min
          </div>
          <div className="fact">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            22 sets
          </div>
        </div>
        <button type="button" className="start-btn">
          Empezar sesión{' '}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="rings-glass aurora-glass">
        <div className="head">
          <span className="title">Adherencia · esta semana</span>
          <span className="sub">W3</span>
        </div>
        <div className="rings-row">
          <div className="ring-item">
            <div className="ring-svg">
              <svg viewBox="0 0 62 62" aria-hidden>
                <circle cx="31" cy="31" r="25" fill="none" stroke="var(--ring-track)" strokeWidth="5" />
                <circle
                  cx="31"
                  cy="31"
                  r="25"
                  fill="none"
                  stroke={`url(#${idPrefix}-g1)`}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="157"
                  strokeDashoffset="47"
                  transform="rotate(-90 31 31)"
                />
                <defs>
                  <linearGradient id={`${idPrefix}-g1`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#7B5CFF" />
                    <stop offset="1" stopColor="#C77BFF" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="val">70%</div>
            </div>
            <div className="lbl">Gym</div>
          </div>
          <div className="ring-item">
            <div className="ring-svg">
              <svg viewBox="0 0 62 62" aria-hidden>
                <circle cx="31" cy="31" r="25" fill="none" stroke="var(--ring-track)" strokeWidth="5" />
                <circle
                  cx="31"
                  cy="31"
                  r="25"
                  fill="none"
                  stroke={`url(#${idPrefix}-g2)`}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="157"
                  strokeDashoffset="19"
                  transform="rotate(-90 31 31)"
                />
                <defs>
                  <linearGradient id={`${idPrefix}-g2`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#50E3C2" />
                    <stop offset="1" stopColor="#4AC7FF" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="val">88%</div>
            </div>
            <div className="lbl">Dieta</div>
          </div>
          <div className="ring-item">
            <div className="ring-svg">
              <svg viewBox="0 0 62 62" aria-hidden>
                <circle cx="31" cy="31" r="25" fill="none" stroke="var(--ring-track)" strokeWidth="5" />
                <circle
                  cx="31"
                  cy="31"
                  r="25"
                  fill="none"
                  stroke={`url(#${idPrefix}-g3)`}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="157"
                  strokeDashoffset="97"
                  transform="rotate(-90 31 31)"
                />
                <defs>
                  <linearGradient id={`${idPrefix}-g3`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#FF8A3D" />
                    <stop offset="1" stopColor="#FFC14D" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="val">38%</div>
            </div>
            <div className="lbl">Cardio</div>
          </div>
        </div>
      </div>
      <div className="two-cards">
        <div className="mini-card aurora-glass">
          <div className="lbl">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M20 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Peso
          </div>
          <div className="val">
            64.2<span className="unit">kg</span>
          </div>
          <div className="delta">↓ -1.3 kg · 30d</div>
        </div>
        <div className="mini-card aurora-glass">
          <div className="lbl">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            Racha
          </div>
          <div className="val">
            12<span className="unit"> días</span>
          </div>
          <div className="spark-bar">
            <div className="bar" style={{ height: '35%' }} />
            <div className="bar" style={{ height: '50%' }} />
            <div className="bar" style={{ height: '30%' }} />
            <div className="bar" style={{ height: '65%' }} />
            <div className="bar" style={{ height: '55%' }} />
            <div className="bar" style={{ height: '75%' }} />
            <div className="bar" style={{ height: '90%' }} />
          </div>
        </div>
      </div>
      <div className="tab-bar aurora-glass">
        <button type="button" className="active" aria-current="page">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 12L12 4l9 8" />
            <path d="M5 10v10h14V10" />
          </svg>
        </button>
        <button type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="9" width="4" height="6" />
            <rect x="17" y="9" width="4" height="6" />
            <rect x="7" y="11" width="10" height="2" />
          </svg>
        </button>
        <button type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 2v20M2 12h20" />
          </svg>
        </button>
        <button type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 18l6-6 4 4 8-8" />
            <path d="M14 8h7v7" />
          </svg>
        </button>
        <button type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 4-7 8-7s8 3 8 7" />
          </svg>
        </button>
      </div>
    </>
  )
}

function CoachClientDetail({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <StatusBar />
      <div className="cd-top">
        <div className="back aurora-glass">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </div>
        <div className="crumb">
          clientes · <strong>perfil</strong>
        </div>
        <div className="more aurora-glass">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </div>
      </div>
      <div className="cd-profile">
        <div className="photo">
          JM<span className="active-dot" />
        </div>
        <h2>Joaquín Muñoz</h2>
        <div className="meta">
          <span>28 años</span>
          <span className="sep" />
          <span>178 cm · 78 kg</span>
          <span className="sep" />
          <span>W3/12</span>
        </div>
      </div>
      <div className="cd-stats aurora-glass">
        <div className="cd-stat">
          <div className="val accent">98%</div>
          <div className="lbl">Adherencia</div>
        </div>
        <div className="cd-stat">
          <div className="val">12d</div>
          <div className="lbl">Racha</div>
        </div>
        <div className="cd-stat">
          <div className="val">3</div>
          <div className="lbl">PRs mes</div>
        </div>
      </div>
      <div className="cd-tabs aurora-glass">
        <button type="button" className="cd-tab active">
          Overview
        </button>
        <button type="button" className="cd-tab">
          Análisis
        </button>
        <button type="button" className="cd-tab">
          Plan
        </button>
        <button type="button" className="cd-tab">
          Pagos
        </button>
      </div>
      <div className="cd-chart aurora-glass">
        <div className="head">
          <span className="title">Peso corporal</span>
          <span className="range">30 DÍAS</span>
        </div>
        <div className="big-num">
          78.4<span className="unit">kg</span>
        </div>
        <div className="delta">↓ -1.2 kg · meta -3</div>
        <svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`${idPrefix}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--brand)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,30 C20,25 40,45 60,40 C80,38 100,22 120,30 C140,38 160,28 180,35 C200,42 220,32 240,42 C260,50 280,48 300,55 L300,80 L0,80 Z"
            fill={`url(#${idPrefix}-area)`}
          />
          <path
            d="M0,30 C20,25 40,45 60,40 C80,38 100,22 120,30 C140,38 160,28 180,35 C200,42 220,32 240,42 C260,50 280,48 300,55"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="300" cy="55" r="4" fill="var(--brand)" />
          <circle cx="300" cy="55" r="8" fill="var(--brand)" opacity="0.25" />
        </svg>
      </div>
      <div className="cd-activity aurora-glass">
        <div className="head">Actividad reciente</div>
        <div className="act-row">
          <div className="ico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="9" width="4" height="6" />
              <rect x="17" y="9" width="4" height="6" />
              <rect x="7" y="11" width="10" height="2" />
            </svg>
          </div>
          <div className="info">
            <div className="name">Push Day completado</div>
            <div className="time">hace 2h · PR Bench +2.5</div>
          </div>
          <div className="val">+220 vol</div>
        </div>
        <div className="act-row">
          <div className="ico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M20 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <div className="info">
            <div className="name">Check-in mañana</div>
            <div className="time">hace 7h · sueño 7.5h</div>
          </div>
          <div className="val">78.4 kg</div>
        </div>
        <div className="act-row">
          <div className="ico">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12l5 5L20 7" />
            </svg>
          </div>
          <div className="info">
            <div className="name">5 comidas registradas</div>
            <div className="time">ayer · 1820 kcal</div>
          </div>
          <div className="val">100%</div>
        </div>
      </div>
      <div className="cd-cta aurora-glass">
        <div className="msg-btn">Escribir mensaje al alumno…</div>
        <button type="button" className="send" aria-label="Enviar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </>
  )
}

function CoachHomeDashboard({ idPrefix }: { idPrefix: string }) {
  return (
    <>
      <StatusBar />
      <div className="ch-top">
        <div className="ch-brand">
          <span className="mark" aria-hidden />
          EVA
        </div>
        <div className="sd-bell aurora-glass">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10 21h4" />
          </svg>
        </div>
      </div>
      <div className="ch-title-block">
        <div className="lbl">Coach · resumen</div>
        <h2>Tu negocio hoy</h2>
      </div>
      <div className="ch-stats aurora-glass">
        <div className="ch-stat">
          <div className="num accent">24</div>
          <div className="lbl">Alumnos</div>
        </div>
        <div className="ch-stat">
          <div className="num">18</div>
          <div className="lbl">Planes activos</div>
        </div>
        <div className="ch-stat">
          <div className="num accent">87%</div>
          <div className="lbl">Adherencia</div>
        </div>
      </div>
      <div className="ch-chart-mini aurora-glass">
        <div className="row">
          <span className="t">Ingresos · MRR</span>
          <span className="r">+12%</span>
        </div>
        <svg viewBox="0 0 300 72" preserveAspectRatio="none" width="100%" height="72" aria-hidden>
          <defs>
            <linearGradient id={`${idPrefix}-mrr`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--brand)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,50 C40,48 80,35 120,40 C160,45 200,25 240,30 C270,33 290,20 300,15 L300,72 L0,72 Z"
            fill={`url(#${idPrefix}-mrr)`}
          />
          <path
            d="M0,50 C40,48 80,35 120,40 C160,45 200,25 240,30 C270,33 290,20 300,15"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="ch-clients aurora-glass">
        <div className="h">Prioridad · esta semana</div>
        <div className="ch-row">
          <div className="av">C</div>
          <div className="tx">
            <div className="nm">Camila R.</div>
            <div className="sub">Check-in pendiente · ayer</div>
          </div>
          <span className="pill">Alta</span>
        </div>
        <div className="ch-row">
          <div className="av">L</div>
          <div className="tx">
            <div className="nm">Lucas P.</div>
            <div className="sub">Plan vence en 3 días</div>
          </div>
          <span className="pill">Medio</span>
        </div>
        <div className="ch-row">
          <div className="av">M</div>
          <div className="tx">
            <div className="nm">María G.</div>
            <div className="sub">Adherencia 98% · OK</div>
          </div>
          <span className="pill">OK</span>
        </div>
      </div>
      <div className="ch-nav aurora-glass">
        <button type="button" className="active" aria-current="page">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 12L12 4l9 8" />
            <path d="M5 10v10h14V10" />
          </svg>
        </button>
        <button type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>
        <button type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="9" width="4" height="6" />
            <rect x="17" y="9" width="4" height="6" />
            <rect x="7" y="11" width="10" height="2" />
          </svg>
        </button>
        <button type="button">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>
    </>
  )
}

function MiMarcaScreen() {
  return (
    <>
      <StatusBar />
      <div className="br-top">
        <span className="t">Mi marca</span>
        <div className="br-more aurora-glass">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </div>
      </div>
      <div className="br-logo-zone">
        <div className="circle" aria-hidden />
        <div className="hint">Logo · arrastra o sube · se refleja en app alumno</div>
      </div>
      <div className="br-colors aurora-glass">
        <div className="h">Color primario coach</div>
        <div className="br-swatches">
          <span style={{ background: '#7B5CFF' }} title="Purple" />
          <span style={{ background: '#FF8A3D' }} title="Amber" />
          <span style={{ background: '#50E3C2' }} title="Teal" />
          <span style={{ background: '#FF3B82' }} title="Coral" />
          <span style={{ background: '#0091FF' }} title="Ocean" />
        </div>
      </div>
      <div className="br-toggle aurora-glass">
        <div>
          <div className="txx">Usar mi color en la app del alumno</div>
          <div className="subx">Orbes y acentos heredan tu marca</div>
        </div>
        <div className="br-switch" aria-hidden />
      </div>
      <div className="br-preview-card aurora-glass">
        <div className="lbl">Vista previa alumno</div>
        <div className="br-mini-phone">
          <div className="bar" />
          <div className="cta" />
        </div>
      </div>
    </>
  )
}

function PlanBuilderScreen() {
  return (
    <>
      <StatusBar />
      <div className="pb-top">
        <div className="back aurora-glass">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </div>
        <div className="meta">
          <div className="t1">Creador de planes</div>
          <div className="t2">Joaquín · Fuerza W3</div>
        </div>
      </div>
      <div className="pb-week">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={d} className={`pb-day ${i === 0 ? 'on' : ''}`}>
            {d}
          </div>
        ))}
      </div>
      <div className="pb-block aurora-glass">
        <div className="line1">
          <div>
            <div className="ex">Press banca</div>
            <div className="muscle">Pecho</div>
          </div>
          <div className="sets">4×8</div>
        </div>
        <div className="pb-rows">
          <div className="pb-set-row">Set 1 · 60 kg × 8</div>
          <div className="pb-set-row">Set 2 · 60 kg × 8</div>
          <div className="pb-set-row">Set 3 · 62.5 kg × 8</div>
        </div>
      </div>
      <div className="pb-block aurora-glass">
        <div className="line1">
          <div>
            <div className="ex">Remo con barra</div>
            <div className="muscle">Espalda</div>
          </div>
          <div className="sets">3×10</div>
        </div>
        <div className="pb-rows">
          <div className="pb-set-row">Set 1 · 50 kg × 10</div>
          <div className="pb-set-row">Set 2 · 50 kg × 10</div>
        </div>
      </div>
      <button type="button" className="pb-fab" aria-label="Añadir ejercicio">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <div className="pb-bottom-bar aurora-glass">
        <span className="saved">Guardado hace 2 min</span>
        <button type="button" className="btn">
          Vista previa
        </button>
      </div>
    </>
  )
}

export default function AuroraPageClient() {
  const [pageTheme, setPageTheme] = useState<PageTheme>('dark')
  const [coachPrimary, setCoachPrimary] = useState('#7B5CFF')
  const id = useId().replace(/:/g, '')

  const phoneMode: 'light' | 'dark' = pageTheme

  const coachSecondary = useMemo(() => coachSecondaryForTheme(coachPrimary, pageTheme), [coachPrimary, pageTheme])

  const rootStyle = useMemo(
    () =>
      ({
        '--aurora-coach-primary': coachPrimary,
        '--aurora-coach-secondary': coachSecondary,
        '--aurora-coach-rgb': hexToRgbString(coachPrimary),
      }) as CSSProperties,
    [coachPrimary, coachSecondary]
  )

  const phoneGlow = hexToRgba(coachPrimary, 0.33)

  return (
    <div className="aurora-root" data-page-theme={pageTheme} data-coach-brand="" style={rootStyle}>
      <nav className="aurora-toolbar" aria-label="Aurora showcase">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/">← EVA</Link>
          <Link href="/aurora/workoutbuilder" className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] opacity-90 hover:opacity-100">
            Creador planes
          </Link>
        </div>
        <div className="flex max-w-full flex-1 flex-wrap items-center justify-end gap-3">
          <AuroraCoachColorControls value={coachPrimary} onChange={setCoachPrimary} pageTheme={pageTheme} />
          <button
            type="button"
            onClick={() => setPageTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-pressed={pageTheme === 'dark'}
          >
            {pageTheme === 'dark' ? (
              <>
                <Sun size={16} strokeWidth={2} aria-hidden />
                Modo claro
              </>
            ) : (
              <>
                <Moon size={16} strokeWidth={2} aria-hidden />
                Modo oscuro
              </>
            )}
          </button>
        </div>
      </nav>

      <header className="page-header">
        <span className="kicker">
          <span className="dot" />
          EVA · AURORA · LIQUID GLASS
        </span>
        <h1>
          Aurora<span className="dot" />
        </h1>
        <div className="sub-header">
          <div className="sh-cell">
            <div className="lbl">// Tesis</div>
            <div className="val">
              <strong>Vidrio mórfico que respira con el color del coach.</strong> Misma app, distinta por cliente: el brand
              del coach pinta orbes detrás del cristal. White-label en el centro.
            </div>
          </div>
          <div className="sh-cell">
            <div className="lbl">// Tech</div>
            <div className="val">
              <strong>backdrop-filter</strong>
              <br />
              @property · color-mix
              <br />
              conic-gradient · CSS variables
            </div>
          </div>
          <div className="sh-cell">
            <div className="lbl">// Temas</div>
            <div className="val">
              <strong>Claro + Oscuro</strong>
              <br />
              Misma estructura; solo cambian tokens. Cualquier color de marca.
            </div>
          </div>
        </div>
        <div className="wl-strip">
          <span className="label">White-label →</span>
          <div className="wl-chips">
            {AURORA_COLOR_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.label}
                onClick={() => setCoachPrimary(p.hex)}
                className="wl-chip cursor-pointer border-0 p-0 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                style={{
                  background: p.hex,
                  color: p.hex,
                  boxShadow: coachPrimary === p.hex ? `0 0 0 2px #fff, 0 0 16px ${p.hex}` : undefined,
                }}
              />
            ))}
          </div>
          <div className="wl-note">
            Elige color como el coach: teléfonos, desktop y anillos usan <strong>tu marca</strong> (
            <code className="text-[11px] opacity-90">{coachPrimary}</code>
            ). El modo claro/oscuro sigue cambiando el fondo del estudio.
          </div>
        </div>
      </header>

      <section className="screens-wrap">
        <div className="screens-grid">
          <div>
            <ScreenLabel num="01" title="Dashboard alumno · hoy" theme={phoneMode} />
            <PhoneFrame glow={phoneGlow} mode={phoneMode}>
              <StudentDashboard idPrefix={`${id}-stu`} />
            </PhoneFrame>
          </div>
          <div>
            <ScreenLabel num="02" title="Coach · detalle de cliente" theme={phoneMode} />
            <PhoneFrame glow={phoneGlow} mode={phoneMode}>
              <CoachClientDetail idPrefix={`${id}-cli`} />
            </PhoneFrame>
          </div>
          <div>
            <ScreenLabel num="03" title="Coach · panel principal" theme={phoneMode} />
            <PhoneFrame glow={phoneGlow} mode={phoneMode}>
              <CoachHomeDashboard idPrefix={`${id}-home`} />
            </PhoneFrame>
          </div>
          <div>
            <ScreenLabel num="04" title="Mi marca · identidad" theme={phoneMode} />
            <PhoneFrame glow={phoneGlow} mode={phoneMode}>
              <MiMarcaScreen />
            </PhoneFrame>
          </div>
          <div style={{ gridColumn: '1 / -1', maxWidth: 440, margin: '0 auto', width: '100%' }}>
            <ScreenLabel num="05" title="Creador de planes · semana" theme={phoneMode} />
            <PhoneFrame glow={phoneGlow} mode={phoneMode}>
              <PlanBuilderScreen />
            </PhoneFrame>
          </div>
        </div>
      </section>

      <AuroraAppComponentDemos pageTheme={pageTheme} coachPrimary={coachPrimary} />

      <footer className="spec-footer">
        <div className="spec-grid">
          <div className="spec-block">
            <h4>// White-label</h4>
            <div className="wl-demo-grid">
              <div className="wl-demo-swatch" style={{ background: 'linear-gradient(135deg, #7B5CFF, #C77BFF)' }}>
                <span className="label">purple</span>
              </div>
              <div className="wl-demo-swatch" style={{ background: 'linear-gradient(135deg, #FF8A3D, #FFC14D)' }}>
                <span className="label">amber</span>
              </div>
              <div className="wl-demo-swatch" style={{ background: 'linear-gradient(135deg, #50E3C2, #4AC7FF)' }}>
                <span className="label">teal</span>
              </div>
              <div className="wl-demo-swatch" style={{ background: 'linear-gradient(135deg, #FF3B82, #FF8A3D)' }}>
                <span className="label">coral</span>
              </div>
              <div className="wl-demo-swatch" style={{ background: 'linear-gradient(135deg, #0091FF, #50E3C2)' }}>
                <span className="label">ocean</span>
              </div>
              <div className="wl-demo-swatch" style={{ background: 'linear-gradient(135deg, #0A0A14, #2C2C38)' }}>
                <span className="label">eva·def</span>
              </div>
              <div className="wl-demo-swatch" style={{ background: 'linear-gradient(135deg, #FF0080, #7928CA)' }}>
                <span className="label">magenta</span>
              </div>
              <div className="wl-demo-swatch" style={{ background: 'linear-gradient(135deg, #1A1A1A, #F5A623)' }}>
                <span className="label">gold</span>
              </div>
            </div>
            <p style={{ fontSize: 12, lineHeight: 1.5, marginTop: 14, opacity: 0.85 }}>
              Un color primario por coach; el gradiente secundario puede derivarse con color-mix. Activos (tabs, FAB, anillos)
              heredan el par.
            </p>
          </div>
          <div className="spec-block">
            <h4>// Cómo se mapea a EVA hoy</h4>
            <div className="tech-list">
              <div className="tech-item">
                <span className="tag">Alumno</span>
                <div className="desc">
                  Dashboard <code style={{ fontSize: 11 }}>/c/[coach]/dashboard</code>: saludo, entreno del día, adherencia,
                  peso y racha — mismo flujo, envuelto en Aurora.
                </div>
              </div>
              <div className="tech-item">
                <span className="tag">Coach</span>
                <div className="desc">
                  Panel y perfil de cliente: métricas, gráfico de peso, actividad y mensajería como en tu app actual, con
                  cristal y marca.
                </div>
              </div>
              <div className="tech-item">
                <span className="tag">Marca</span>
                <div className="desc">
                  Pantalla equivalente a ajustes de marca: logo, primarios y toggle de color en app alumno.
                </div>
              </div>
              <div className="tech-item">
                <span className="tag">Planes</span>
                <div className="desc">
                  Builder semanal: días, bloques y series — mismo modelo mental que el creador de planes actual.
                </div>
              </div>
            </div>
          </div>
          <div className="spec-block">
            <h4>// Principios</h4>
            <div className="principles">
              <div className="principle">
                <div className="n">01</div>
                <p>
                  <strong>El color del coach vive detrás del vidrio.</strong> Fondo neutro glass; orbes de marca. White-label
                  sin rediseñar cada pantalla.
                </p>
              </div>
              <div className="principle">
                <div className="n">02</div>
                <p>
                  <strong>Claro y oscuro son modos.</strong> Mismos componentes; <code>--surface</code>,{' '}
                  <code>--ink</code>, <code>--brand</code> intercambian.
                </p>
              </div>
              <div className="principle">
                <div className="n">03</div>
                <p>
                  <strong>El glass jerarquiza.</strong> Menos transparencia = más énfasis. CTAs en sólido o gradiente, no
                  vidrio competidor.
                </p>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
