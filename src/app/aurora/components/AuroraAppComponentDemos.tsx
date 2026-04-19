'use client'

import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { ThemeProvider } from 'next-themes'
import {
  LayoutDashboard,
  Users,
  Dumbbell,
  Apple,
  Settings,
  Home,
  Utensils,
  User,
} from 'lucide-react'
import { AuroraDesktopShell } from '@/app/aurora/components/AuroraDesktopShell'
import { GlassCard } from '@/app/aurora/components/ui/glass-card'
import { GlassButton } from '@/app/aurora/components/ui/glass-button'
import { ComplianceRingCluster } from '@/app/aurora/components/dashboard/ComplianceRing'
import { StreakWidget } from '@/app/aurora/components/dashboard/StreakWidget'
import { hexToRgbString } from '@/app/aurora/lib/aurora-brand'

export type AuroraPageTheme = 'light' | 'dark'

function ScreenLabelDesktop({
  num,
  title,
  theme,
}: {
  num: string
  title: string
  theme: AuroraPageTheme
}) {
  return (
    <div className="screen-label" style={{ marginBottom: 16 }}>
      <span className="num">{num}</span>
      <span className="title">{title}</span>
      <span className={theme === 'light' ? 'mode light' : 'mode dark'}>
        {theme === 'light' ? '☀ CLARO' : '☾ OSCURO'} · desktop
      </span>
    </div>
  )
}

export function AuroraAppComponentDemos({
  pageTheme,
  coachPrimary,
}: {
  pageTheme: AuroraPageTheme
  coachPrimary: string
}) {
  const vars = useMemo(
    () =>
      ({
        '--theme-primary': coachPrimary,
        '--theme-primary-rgb': hexToRgbString(coachPrimary),
      }) as CSSProperties,
    [coachPrimary]
  )

  const coachSidebar = (
    <>
      <div className="aurora-desktop-nav-item active">
        <LayoutDashboard className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Dashboard
      </div>
      <div className="aurora-desktop-nav-item">
        <Users className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Alumnos
      </div>
      <div className="aurora-desktop-nav-item">
        <Dumbbell className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Programas
      </div>
      <div className="aurora-desktop-nav-item">
        <Apple className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Nutrición
      </div>
      <div className="aurora-desktop-nav-item">
        <Settings className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Ajustes
      </div>
    </>
  )

  const studentSidebar = (
    <>
      <div className="aurora-desktop-nav-item active">
        <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Inicio
      </div>
      <div className="aurora-desktop-nav-item">
        <Utensils className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Nutrición
      </div>
      <div className="aurora-desktop-nav-item">
        <Dumbbell className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Entrenos
      </div>
      <div className="aurora-desktop-nav-item">
        <User className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        Perfil
      </div>
    </>
  )

  return (
    <section className="aurora-desktop-section" aria-labelledby="aurora-desktop-heading">
      <div className="aurora-dt-spacer" aria-hidden />
      <div className="aurora-desktop-intro">
        <h2 id="aurora-desktop-heading">Vistas desktop y componentes de la app</h2>
        <p>
          Marcos tipo ventana con sidebar. Los bloques de abajo usan{' '}
          <strong>copias locales</strong> en <code className="text-xs opacity-90">src/app/aurora/components/</code> (
          <code className="text-xs opacity-90">GlassCard</code>, <code className="text-xs opacity-90">GlassButton</code>,{' '}
          <code className="text-xs opacity-90">ComplianceRingCluster</code>, <code className="text-xs opacity-90">StreakWidget</code>
          ) para que puedas comparar con producción sin romper rutas. El tema Tailwind va forzado al interruptor Aurora
          mediante <code className="text-xs opacity-90">ThemeProvider</code> anidado.
        </p>
      </div>

      <ThemeProvider attribute="class" forcedTheme={pageTheme} enableSystem={false} storageKey="eva-aurora-preview-theme">
        <div style={vars}>
          <div className="mb-14">
            <ScreenLabelDesktop num="D0" title="Piezas copiadas · UI + adherencia" theme={pageTheme} />
            <div className="aurora-desktop-grid-2">
              <GlassCard className="p-5">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">GlassCard + GlassButton</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  Mismas clases Tailwind que en coach; glow usa <code className="text-[10px]">--theme-primary</code> del
                  interruptor.
                </p>
                <div className="flex flex-wrap gap-2">
                  <GlassButton type="button" variant="brand" size="sm">
                    Primario marca
                  </GlassButton>
                  <GlassButton type="button" variant="outline" size="sm">
                    Outline
                  </GlassButton>
                  <GlassButton type="button" variant="ghost" size="sm">
                    Ghost
                  </GlassButton>
                </div>
              </GlassCard>
              <ComplianceRingCluster
                workoutScore={82}
                nutritionScore={76}
                checkInScore={91}
                nutritionHasLogs
                resolvedThemeOverride={pageTheme}
              />
            </div>
          </div>

          <div className="mb-14">
            <ScreenLabelDesktop num="D1" title="Coach · panel (desktop)" theme={pageTheme} />
            <AuroraDesktopShell url="app.eva.co/coach/dashboard" mode={pageTheme} sidebar={coachSidebar}>
              <p className="mb-4 text-sm font-semibold text-foreground">Hola, Rodrigo</p>
              <div className="aurora-desktop-grid">
                <GlassCard className="aurora-stat-pill p-0">
                  <div className="p-4">
                    <div className="lbl">Alumnos activos</div>
                    <div>24</div>
                  </div>
                </GlassCard>
                <GlassCard className="aurora-stat-pill p-0">
                  <div className="p-4">
                    <div className="lbl">Planes</div>
                    <div>18</div>
                  </div>
                </GlassCard>
                <GlassCard className="aurora-stat-pill p-0">
                  <div className="p-4">
                    <div className="lbl">Adherencia media</div>
                    <div>87%</div>
                  </div>
                </GlassCard>
              </div>
              <div className="aurora-desktop-grid-2">
                <ComplianceRingCluster
                  workoutScore={72}
                  nutritionScore={65}
                  checkInScore={88}
                  nutritionHasLogs={false}
                  resolvedThemeOverride={pageTheme}
                />
                <GlassCard className="p-4">
                  <p className="mb-3 text-xs font-semibold text-muted-foreground">Alertas · 7 días</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex justify-between gap-2 border-b border-border/60 pb-2">
                      <span className="text-foreground">Camila · check-in</span>
                      <span className="shrink-0 font-mono text-xs text-amber-600 dark:text-amber-400">Pendiente</span>
                    </li>
                    <li className="flex justify-between gap-2 border-b border-border/60 pb-2">
                      <span className="text-foreground">Lucas · plan</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">3d</span>
                    </li>
                    <li className="flex justify-between gap-2">
                      <span className="text-foreground">María</span>
                      <span className="shrink-0 font-mono text-xs text-emerald-600 dark:text-emerald-400">OK</span>
                    </li>
                  </ul>
                </GlassCard>
              </div>
            </AuroraDesktopShell>
          </div>

          <div>
            <ScreenLabelDesktop num="D2" title="Alumno · inicio (desktop)" theme={pageTheme} />
            <AuroraDesktopShell url="app.eva.co/c/rodrigo/dashboard" mode={pageTheme} sidebar={studentSidebar}>
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lunes 18 abr</p>
                  <h3 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                    Hola Camila — <span className="text-primary">Push day</span>
                  </h3>
                </div>
                <StreakWidget streak={12} />
              </div>
              <div className="aurora-desktop-grid-2">
                <GlassCard className="p-5">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">Entreno hoy</p>
                  <p className="text-lg font-bold text-foreground">Push · semana 3</p>
                  <p className="mt-1 text-sm text-muted-foreground">Pecho, hombro, tríceps · ~58 min</p>
                  <GlassButton type="button" variant="brand" className="mt-4 w-full sm:w-auto" size="default">
                    Empezar sesión
                  </GlassButton>
                </GlassCard>
                <ComplianceRingCluster
                  workoutScore={70}
                  nutritionScore={88}
                  checkInScore={38}
                  nutritionHasLogs
                  resolvedThemeOverride={pageTheme}
                />
              </div>
            </AuroraDesktopShell>
          </div>
        </div>
      </ThemeProvider>
    </section>
  )
}
