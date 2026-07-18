'use client'

import { Database, Zap } from 'lucide-react'
import { FEATURES } from '../../_data/enterprise-content'
import { FeatureCard } from '../molecules/FeatureCard'
import { SectionEyebrow } from '../atoms/SectionEyebrow'
import { Reveal, RevealStagger, RevealItem } from '@/components/motion/Reveal'

export function EnterpriseFeatureBento() {
  return (
    <section
      id="producto"
      className="relative py-24 px-4 sm:px-6 lg:px-8 overflow-hidden"
      style={{ background: '#F8FAFC' }}
      aria-labelledby="features-heading"
    >
      <div className="relative mx-auto max-w-6xl">
        {/* Header row: text + dashboard mock */}
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 items-center mb-20">
          <Reveal className="lg:w-1/2 space-y-6">
            <SectionEyebrow className="mb-3">{'// CARACTERÍSTICAS'}</SectionEyebrow>
            <h2
              id="features-heading"
              className="text-3xl sm:text-4xl md:text-5xl font-display font-black tracking-[-0.02em] text-gray-900 leading-[1.1]"
            >
              Infraestructura enterprise
              <br />
              <span
                style={{
                  background: 'linear-gradient(90deg, #007AFF 0%, #00E5FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                para equipos de alto rendimiento
              </span>
            </h2>
            <p className="text-base text-gray-600 leading-relaxed">
              No gestionas solo rutinas — gestionas un equipo. EVA Enterprise está
              diseñado para escalar tu talento humano con la misma eficiencia con la
              que sus servidores escalan tus datos.
            </p>
            <RevealStagger className="grid grid-cols-2 gap-4 pt-2">
              <RevealItem>
                <div
                  className="p-5 rounded-2xl border border-gray-100 shadow-sm bg-gradient-to-br from-white to-slate-50"
                >
                  <Database className="h-7 w-7 text-[#007AFF] mb-3" aria-hidden />
                  <h4 className="font-bold text-gray-900 text-sm mb-1">RLS Security</h4>
                  <p className="text-xs text-gray-500">Privacidad por nivel de coach a nivel DB.</p>
                </div>
              </RevealItem>
              <RevealItem>
                <div
                  className="p-5 rounded-2xl border border-gray-100 shadow-sm bg-gradient-to-br from-white to-slate-50"
                >
                  <Zap className="h-7 w-7 text-[#007AFF] mb-3" aria-hidden />
                  <h4 className="font-bold text-gray-900 text-sm mb-1">Multi-Coach</h4>
                  <p className="text-xs text-gray-500">Sincronización total de agendas y alumnos.</p>
                </div>
              </RevealItem>
            </RevealStagger>
          </Reveal>

          {/* Dashboard mock SVG/HTML */}
          <Reveal variant="scale" delay={0.15} className="lg:w-1/2 w-full">
            <DashboardMock />
          </Reveal>
        </div>

        {/* Bento grid */}
        <RevealStagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(feature => (
            <RevealItem
              key={feature.title}
              className={feature.size === 'large' ? 'sm:col-span-2 md:col-span-2' : undefined}
            >
              <FeatureCard
                icon={feature.icon}
                title={feature.title}
                desc={feature.desc}
                size={feature.size as 'normal' | 'large'}
              />
            </RevealItem>
          ))}
        </RevealStagger>
      </div>
    </section>
  )
}

function DashboardMock() {
  return (
    <div
      className="relative rounded-[28px] p-1 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(0,122,255,0.15) 0%, rgba(0,229,255,0.10) 100%)',
        boxShadow: '0 24px 64px -16px rgba(0,122,255,0.25)',
      }}
    >
      <div className="rounded-[24px] bg-white p-6 sm:p-7">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-gray-400">
            {'// panel org'}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.15em] text-emerald-500">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Coaches', value: '8' },
            { label: 'Alumnos', value: '247' },
            { label: 'Adherencia', value: '92%' },
          ].map(s => (
            <div key={s.label} className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-[9px] font-mono uppercase tracking-[0.15em] text-gray-400">
                {s.label}
              </div>
              <div className="text-xl font-display font-black text-gray-900 tabular-nums mt-0.5">
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Coach rows */}
        <div className="space-y-2 mb-5">
          {[
            { name: 'Ana López', students: 12, color: '#007AFF' },
            { name: 'Marco Ruiz', students: 18, color: '#00E5FF' },
            { name: 'Sofía Castro', students: 9, color: '#0040DD' },
          ].map(c => (
            <div
              key={c.name}
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2.5"
            >
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                style={{ background: `linear-gradient(135deg, ${c.color} 0%, ${c.color}AA 100%)` }}
              >
                {c.name
                  .split(' ')
                  .map(n => n[0])
                  .join('')}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900 truncate">{c.name}</p>
                <p className="text-[10px] text-gray-400">{c.students} alumnos asignados</p>
              </div>
              <div className="h-1.5 w-16 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, c.students * 5.5)}%`,
                    background: 'linear-gradient(90deg, #007AFF 0%, #00E5FF 100%)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Savings card */}
        <div
          className="rounded-xl p-4"
          style={{
            background: 'linear-gradient(135deg, rgba(0,122,255,0.06) 0%, rgba(0,229,255,0.08) 100%)',
            border: '1px solid rgba(0,122,255,0.18)',
          }}
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#007AFF] mb-1">
            {'// Ahorro este mes'}
          </p>
          <p className="text-2xl font-display font-black text-gray-900 tabular-nums">
            $59.960 CLP
          </p>
        </div>
      </div>
    </div>
  )
}
