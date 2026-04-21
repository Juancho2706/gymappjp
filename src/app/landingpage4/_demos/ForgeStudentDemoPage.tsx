'use client'

import { useState } from 'react'
import { Apple, Camera, CheckCircle, ChevronRight, Dumbbell, Flame, Home, Sparkles, TrendingUp, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEMO_STUDENT } from './forge-demo-mocks'
import { ForgeDemoChrome } from './ForgeDemoChrome'

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const
const TODAY_IDX = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
const WORKOUT_DAYS = [0, 2, 4] as const

type StudentTab = 'home' | 'nutrition' | 'workout' | 'checkin'

const NAV: { id: StudentTab; icon: typeof Home; label: string }[] = [
    { id: 'home', icon: Home, label: 'Inicio' },
    { id: 'nutrition', icon: Apple, label: 'Nutrición' },
    { id: 'workout', icon: Dumbbell, label: 'Entreno' },
    { id: 'checkin', icon: CheckCircle, label: 'Check-in' },
]

export function ForgeStudentDemoPage() {
    const accent = 'var(--forge-accent)'
    const [tab, setTab] = useState<StudentTab>('home')

    return (
        <div className="flex min-h-[100dvh] flex-col bg-[var(--forge-bg)] md:flex-row">
            <div className="flex min-w-0 flex-1 flex-col md:flex-[2]">
                <ForgeDemoChrome
                    title="Vista alumno"
                    subtitle="App cliente · demo"
                    breadcrumb={
                        tab === 'home'
                            ? 'Alumno · Inicio'
                            : tab === 'nutrition'
                              ? 'Alumno · Nutrición'
                              : tab === 'workout'
                                ? 'Alumno · Entrenamiento'
                                : 'Alumno · Check-in'
                    }
                />
                <p className="forge-font-mono border-b border-[var(--forge-border)] bg-[var(--forge-accent-bg)] px-3 py-2 text-center text-[9px] uppercase tracking-wider text-[var(--forge-accent)]">
                    Vitrina de interfaz — no es tu cuenta ni datos reales.
                </p>

                <div className="mx-auto flex w-full max-w-md flex-1 flex-col border-x border-[var(--forge-border)] bg-[var(--forge-surface)] md:my-4 md:max-h-[min(820px,85dvh)] md:rounded-[12px] md:shadow-[6px_6px_0_var(--forge-ink)]">
                    <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-[var(--forge-border)] px-3 py-3">
                        <div className="min-w-0">
                            <p className="forge-font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--forge-muted)]">{DEMO_STUDENT.brandName}</p>
                            <p className="forge-font-display truncate text-base font-extrabold text-[var(--forge-ink)]">Hola, {DEMO_STUDENT.greetingName}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="forge-font-mono flex items-center gap-1 rounded-full border border-[var(--forge-border)] px-2 py-0.5 text-[9px] font-bold text-[var(--forge-warning)]">
                                <Flame className="size-3" />
                                {DEMO_STUDENT.streak}
                            </span>
                            <span
                                className="forge-font-mono rounded-md border px-2 py-0.5 text-[9px] font-bold"
                                style={{ borderColor: accent, color: accent }}
                            >
                                {DEMO_STUDENT.checkInLabel}
                            </span>
                        </div>
                    </header>

                    <main className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
                        {tab === 'home' ? <StudentHome accent={accent} /> : null}
                        {tab === 'nutrition' ? <StudentNutrition accent={accent} /> : null}
                        {tab === 'workout' ? <StudentWorkout accent={accent} /> : null}
                        {tab === 'checkin' ? <StudentCheckin /> : null}
                    </main>

                    <nav className="flex flex-shrink-0 justify-around border-t border-[var(--forge-border)] bg-[var(--forge-surface)] px-2 py-2" aria-label="Navegación demo alumno">
                        {NAV.map(({ id, icon: Icon, label }) => {
                            const active = tab === id
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => setTab(id)}
                                    aria-current={active ? 'page' : undefined}
                                    className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--forge-accent)]/40"
                                >
                                    {active ? <div className="-mt-1 mb-0.5 h-0.5 w-6 rounded-full" style={{ backgroundColor: accent }} /> : <div className="mb-0.5 h-0.5 w-6" />}
                                    <Icon className="size-5" style={{ color: active ? accent : 'var(--forge-muted)' }} aria-hidden />
                                    <span className="forge-font-mono text-[8px] font-semibold" style={{ color: active ? accent : 'var(--forge-muted)' }}>
                                        {label}
                                    </span>
                                </button>
                            )
                        })}
                    </nav>
                </div>
            </div>

            <aside className="hidden border-l border-[var(--forge-border)] bg-[var(--forge-surface-alt)]/50 p-6 md:block md:w-72 lg:w-80">
                <p className="forge-font-mono text-[9px] font-bold uppercase tracking-widest text-[var(--forge-muted)]">Contexto</p>
                <p className="forge-font-display mt-2 text-lg font-black text-[var(--forge-ink)]">Así ve el alumno tu marca</p>
                <ul className="mt-4 space-y-2 text-sm leading-relaxed text-[var(--forge-ink-2)]">
                    <li>· PWA con slug del coach</li>
                    <li>· El coach opera en escritorio; el alumno en móvil</li>
                    <li>· Navegación inferior similar a la app real</li>
                </ul>
            </aside>
        </div>
    )
}

function StudentHome({ accent }: { accent: string }) {
    return (
        <>
            <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] p-3">
                <div className="mx-auto flex max-w-xs justify-between">
                    {DAYS.map((day, i) => {
                        const isToday = i === TODAY_IDX
                        const hasWorkout = (WORKOUT_DAYS as readonly number[]).includes(i)
                        return (
                            <div key={day} className="flex flex-col items-center gap-1">
                                <span
                                    className="forge-font-mono text-[9px] font-bold"
                                    style={{ color: isToday ? 'var(--forge-ink)' : 'var(--forge-muted)' }}
                                >
                                    {day}
                                </span>
                                <div
                                    className="flex size-7 items-center justify-center rounded-full text-[11px] font-bold"
                                    style={
                                        isToday
                                            ? { backgroundColor: accent, color: '#fff' }
                                            : hasWorkout
                                              ? {
                                                    color: accent,
                                                    border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
                                                    backgroundColor: 'var(--forge-accent-bg)',
                                                }
                                              : { color: 'var(--forge-dim)' }
                                    }
                                >
                                    {new Date(new Date().setDate(new Date().getDate() - TODAY_IDX + i)).getDate()}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
                <div className="relative overflow-hidden rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4">
                    <div className="absolute bottom-3 left-0 top-3 w-[3px] rounded-r-sm bg-[var(--forge-ink)]" aria-hidden />
                    <div className="flex items-start justify-between pl-2">
                        <div
                            className="flex size-9 items-center justify-center rounded-lg border"
                            style={{
                                borderColor: accent,
                                backgroundColor: 'var(--forge-accent-bg)',
                            }}
                        >
                            <Dumbbell className="size-4" style={{ color: accent }} />
                        </div>
                        <ChevronRight className="size-4 text-[var(--forge-muted)]" />
                    </div>
                    <p className="forge-font-mono mt-2 pl-2 text-[10px] font-medium text-[var(--forge-muted)]">Entrenamiento de hoy</p>
                    <p className="pl-2 font-bold text-[var(--forge-ink)]">{DEMO_STUDENT.workoutTitle}</p>
                    <div
                        className="forge-font-mono mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 pl-2 text-[10px] font-bold"
                        style={{ backgroundColor: 'var(--forge-accent-bg)', color: accent }}
                    >
                        Empezar ahora →
                    </div>
                </div>

                <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4">
                    <div className="flex items-start justify-between">
                        <div className="flex size-9 items-center justify-center rounded-lg border border-[var(--forge-success)]/30 bg-[var(--forge-success)]/10">
                            <Apple className="size-4 text-[var(--forge-success)]" />
                        </div>
                        <ChevronRight className="size-4 text-[var(--forge-muted)]" />
                    </div>
                    <p className="forge-font-mono mt-2 text-[10px] font-medium text-[var(--forge-muted)]">Plan nutricional</p>
                    <p className="font-bold text-[var(--forge-ink)]">{DEMO_STUDENT.nutritionPlan}</p>
                    <div className="forge-font-mono mt-2 inline-flex rounded-lg bg-[var(--forge-success)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--forge-success)]">
                        Ver comidas →
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {(
                    [
                        { icon: Calendar, label: 'Este mes', value: '12', sub: 'sesiones' },
                        { icon: Flame, label: 'Racha', value: '5', sub: 'días' },
                        { icon: TrendingUp, label: 'Cumpl.', value: '82%', sub: 'objetivo' },
                    ] as const
                ).map(({ icon: Icon, label, value, sub }) => (
                    <div key={label} className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] p-2 text-center">
                        <Icon className="mx-auto mb-1 size-4" style={{ color: accent }} />
                        <p className="forge-font-mono text-[8px] font-medium text-[var(--forge-muted)]">{label}</p>
                        <p className="text-sm font-extrabold text-[var(--forge-ink)]">{value}</p>
                        <p className="forge-font-mono text-[8px] text-[var(--forge-muted)]">{sub}</p>
                    </div>
                ))}
            </div>

            <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4">
                <div className="mb-2 flex items-center gap-2">
                    <span className="text-[var(--forge-accent)]">⚡</span>
                    <p className="forge-font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--forge-muted)]">Programa activo</p>
                </div>
                <p className="font-bold text-[var(--forge-ink)]">{DEMO_STUDENT.programTitle}</p>
                <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--forge-surface-alt)]">
                    <div className="h-1.5 rounded-full" style={{ width: `${DEMO_STUDENT.programProgressPct}%`, backgroundColor: accent }} />
                </div>
                <p className="forge-font-mono mt-1 text-[9px] text-[var(--forge-muted)]">{DEMO_STUDENT.programWeekLabel}</p>
            </div>
        </>
    )
}

function StudentNutrition({ accent }: { accent: string }) {
    return (
        <>
            <p className="forge-font-mono text-[10px] font-bold uppercase text-[var(--forge-muted)]">Día de ejemplo</p>
            <div className="space-y-2">
                {(['Desayuno', 'Almuerzo', 'Cena'] as const).map((meal) => (
                    <div key={meal} className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-[var(--forge-ink)]">{meal}</p>
                            <span className="forge-font-mono text-[9px]" style={{ color: accent }}>
                                520 kcal
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--forge-ink-2)]">Pollo, arroz, ensalada · ejemplo</p>
                    </div>
                ))}
            </div>
            <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface-alt)] p-3 text-center">
                <p className="forge-font-mono text-[9px] font-bold uppercase text-[var(--forge-muted)]">Adherencia 30 días (ejemplo)</p>
                <p className="forge-font-display mt-1 text-2xl font-black" style={{ color: accent }}>
                    78%
                </p>
            </div>
        </>
    )
}

function StudentWorkout({ accent }: { accent: string }) {
    return (
        <>
            <p className="font-bold text-[var(--forge-ink)]">{DEMO_STUDENT.workoutTitle}</p>
            <p className="forge-font-mono text-[10px] text-[var(--forge-muted)]">Registro de series · solo lectura en demo</p>
            {[1, 2].map((set) => (
                <div
                    key={set}
                    className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-3 opacity-90"
                    style={{ borderTopWidth: '3px', borderTopColor: accent }}
                >
                    <p className="forge-font-mono text-[9px] font-bold text-[var(--forge-muted)]">Serie {set}</p>
                    <div className="mt-2 flex gap-2">
                        <div className="flex-1 rounded-md border border-[var(--forge-border)] bg-[var(--forge-bg)] px-2 py-2 text-center text-sm font-bold text-[var(--forge-dim)]">
                            —
                        </div>
                        <div className="flex-1 rounded-md border border-[var(--forge-border)] bg-[var(--forge-bg)] px-2 py-2 text-center text-sm font-bold text-[var(--forge-dim)]">
                            —
                        </div>
                    </div>
                    <button
                        type="button"
                        disabled
                        className="forge-font-mono mt-2 w-full rounded-md border border-[var(--forge-border)] py-2 text-[10px] font-bold uppercase text-[var(--forge-muted)]"
                    >
                        Registrar set (deshabilitado)
                    </button>
                </div>
            ))}
        </>
    )
}

function StudentCheckin() {
    return (
        <>
            <p className="forge-font-mono text-[10px] font-bold uppercase text-[var(--forge-muted)]">Wizard check-in (3 pasos)</p>
            <div className="flex justify-center gap-2">
                {([1, 2, 3] as const).map((step) => (
                    <div
                        key={step}
                        className={cn(
                            'flex size-8 items-center justify-center rounded-full border-2 text-xs font-black',
                            step === 1 ? 'border-[var(--forge-accent)] bg-[var(--forge-accent)] text-white' : 'border-[var(--forge-border)] text-[var(--forge-muted)]'
                        )}
                    >
                        {step}
                    </div>
                ))}
            </div>
            <div className="rounded-[10px] border border-[var(--forge-border)] bg-[var(--forge-surface)] p-4 text-center">
                <Sparkles className="mx-auto size-8 text-[var(--forge-warning)]" />
                <p className="mt-2 text-sm font-semibold text-[var(--forge-ink)]">Energía</p>
                <p className="mt-1 text-xs text-[var(--forge-ink-2)]">En la app real eliges nivel; aquí solo mock.</p>
            </div>
            <div className="rounded-[10px] border border-dashed border-[var(--forge-border)] bg-[var(--forge-surface-alt)] p-4 text-center">
                <p className="text-xs text-[var(--forge-muted)]">Peso · Foto dual</p>
                <Camera className="mx-auto mt-2 size-6 text-[var(--forge-muted)]" aria-hidden />
            </div>
        </>
    )
}
