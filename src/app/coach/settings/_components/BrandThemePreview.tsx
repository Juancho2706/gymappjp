'use client'

import { useState } from 'react'
import {
    Sun,
    Moon,
    Home,
    Apple,
    Dumbbell,
    CheckCircle,
    Flame,
    Calendar,
    TrendingUp,
    Search,
    ArrowLeft,
    Info,
    ChevronRight,
    ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EvaRouteLoader } from '@/components/ui/EvaRouteLoader'
import Image from 'next/image'

interface Props {
    brandName: string
    primaryColor: string
    logoUrl?: string | null
    welcomeMessage?: string | null
    loaderText?: string
    useCustomLoader?: boolean
    loaderTextColor?: string
    loaderIconMode?: 'eva' | 'coach' | 'none'
}

/* ─── helpers ─── */
const mutedCls = (isDark: boolean) => (isDark ? 'text-zinc-400' : 'text-zinc-500')
const strongCls = (isDark: boolean) => (isDark ? 'text-white' : 'text-zinc-900')
const cardBgCls = (isDark: boolean) => (isDark ? 'bg-white/5 border-white/10' : 'bg-white border-zinc-200')
const subtleBgCls = (isDark: boolean) => (isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-zinc-200')
const pxMix = (primaryColor: string, val: string) => `color-mix(in srgb, ${primaryColor} ${val}, transparent)`

/* ─── screen sub-components ─── */
function PreviewHomeScreen({ isDark, primaryColor, brandName }: { isDark: boolean; primaryColor: string; brandName: string }) {
    const muted = mutedCls(isDark)
    const strong = strongCls(isDark)
    const cardBg = cardBgCls(isDark)
    const subtleBg = subtleBgCls(isDark)
    const px = (v: string) => pxMix(primaryColor, v)

    return (
        <div className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
                <p className={cn('text-[10px] font-bold uppercase tracking-widest', muted)}>{brandName}</p>
                <span
                    className="text-[8px] font-bold px-1.5 py-0.5 rounded border"
                    style={{ borderColor: primaryColor, color: primaryColor, backgroundColor: px('8%') }}
                >
                    Check-in
                </span>
            </div>

            <div className={cn('rounded-xl p-2 flex justify-between border', subtleBg)}>
                {['L', 'M', 'X', 'J', 'V'].map((d, i) => (
                    <div key={d} className="flex flex-col items-center gap-1">
                        <span className={cn('text-[8px] font-bold', i === 1 ? 'text-white' : muted)}>{d}</span>
                        <div
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                            style={
                                i === 1
                                    ? { backgroundColor: primaryColor, color: '#fff' }
                                    : { color: isDark ? '#71717a' : '#a1a1aa' }
                            }
                        >
                            {12 + i}
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className={cn('rounded-xl p-2.5 border', cardBg)}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: px('15%') }}>
                        <Dumbbell className="w-3 h-3" style={{ color: primaryColor }} />
                    </div>
                    <p className={cn('text-[8px] font-bold', muted)}>Entreno hoy</p>
                    <p className={cn('text-[10px] font-extrabold', strong)}>Tren Superior</p>
                </div>
                <div className={cn('rounded-xl p-2.5 border', cardBg)}>
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center mb-1.5 bg-emerald-500/10">
                        <Apple className="w-3 h-3 text-emerald-500" />
                    </div>
                    <p className={cn('text-[8px] font-bold', muted)}>Nutrición</p>
                    <p className={cn('text-[10px] font-extrabold', strong)}>Plan Volumen</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {[
                    { icon: Calendar, label: 'Mes', value: '12' },
                    { icon: Flame, label: 'Racha', value: '5' },
                    { icon: TrendingUp, label: 'Progreso', value: '82%' },
                ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className={cn('rounded-xl p-2 text-center border', cardBg)}>
                        <Icon className="w-3 h-3 mx-auto mb-1" style={{ color: primaryColor }} />
                        <p className={cn('text-[7px] font-bold', muted)}>{label}</p>
                        <p className={cn('text-[10px] font-extrabold', strong)}>{value}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}

function PreviewNutritionScreen({ isDark, primaryColor }: { isDark: boolean; primaryColor: string }) {
    const muted = mutedCls(isDark)
    const strong = strongCls(isDark)
    const cardBg = cardBgCls(isDark)

    return (
        <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
                <div className={cn('w-7 h-7 flex items-center justify-center rounded-xl', isDark ? 'bg-white/5' : 'bg-gray-100')}>
                    <ArrowLeft className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className={cn('text-xs font-black tracking-tight', strong)}>Plan Nutricional</h2>
                    <p className={cn('text-[8px] font-medium', muted)}>Plan Volumen</p>
                </div>
                <Info className={cn('w-3.5 h-3.5', muted)} />
            </div>

            <div className={cn('flex items-center justify-between rounded-xl px-3 py-2 border', cardBg)}>
                <ChevronRight className={cn('w-3 h-3 rotate-180', muted)} />
                <span className={cn('text-[9px] font-bold', strong)}>Hoy, 26 Abr</span>
                <ChevronRight className={cn('w-3 h-3', muted)} />
            </div>

            <div className={cn('rounded-2xl p-3 border space-y-2', cardBg)}>
                <div className="flex items-baseline justify-between">
                    <span className={cn('text-[8px] font-black uppercase tracking-widest', muted)}>Energía diaria</span>
                    <span className="text-xs font-black text-emerald-500">68%</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full w-[68%] bg-emerald-500 rounded-full" />
                </div>
                <div className="flex justify-around pt-1">
                    {[
                        { label: 'Proteína', color: '#f97316', val: '142' },
                        { label: 'Carbos', color: '#3b82f6', val: '210' },
                        { label: 'Grasas', color: '#eab308', val: '58' },
                    ].map((m) => (
                        <div key={m.label} className="flex flex-col items-center gap-0.5">
                            <div className="relative w-10 h-10">
                                <svg width={40} height={40} className="-rotate-90">
                                    <circle cx={20} cy={20} r={14} fill="none" strokeWidth={4} className={isDark ? 'stroke-white/10' : 'stroke-zinc-200'} />
                                    <circle
                                        cx={20}
                                        cy={20}
                                        r={14}
                                        fill="none"
                                        strokeWidth={4}
                                        strokeLinecap="round"
                                        stroke={m.color}
                                        strokeDasharray={`${2 * Math.PI * 14}`}
                                        strokeDashoffset={2 * Math.PI * 14 * 0.3}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className={cn('text-[8px] font-black', strong)}>{m.val}</span>
                                </div>
                            </div>
                            <span className={cn('text-[7px] font-bold uppercase tracking-wider', muted)}>{m.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                {[
                    { name: 'Desayuno', kcal: 620, p: 45, c: 55, g: 18, done: true },
                    { name: 'Almuerzo', kcal: 850, p: 60, c: 80, g: 25, done: false },
                    { name: 'Cena', kcal: 520, p: 35, c: 40, g: 15, done: false },
                ].map((meal) => (
                    <div
                        key={meal.name}
                        className={cn(
                            'rounded-xl p-2.5 border flex items-center gap-2',
                            meal.done ? 'bg-emerald-500/[0.04] border-emerald-500/25' : cardBg
                        )}
                    >
                        <div
                            className={cn(
                                'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                                meal.done ? 'bg-emerald-500 border-emerald-500' : isDark ? 'border-zinc-600' : 'border-zinc-300'
                            )}
                        >
                            {meal.done && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <span
                                    className={cn(
                                        'text-[10px] font-black',
                                        meal.done ? 'text-emerald-600 dark:text-emerald-400 line-through' : strong
                                    )}
                                >
                                    {meal.name}
                                </span>
                                <span
                                    className={cn(
                                        'text-[8px] font-black px-1.5 py-0.5 rounded-full',
                                        isDark ? 'bg-white/10 text-zinc-300' : 'bg-gray-100 text-zinc-600'
                                    )}
                                >
                                    {meal.kcal} kcal
                                </span>
                            </div>
                            <div className="flex gap-2 mt-0.5">
                                <span className="text-[8px] font-bold text-orange-500">P {meal.p}g</span>
                                <span className="text-[8px] font-bold text-blue-500">C {meal.c}g</span>
                                <span className="text-[8px] font-bold text-yellow-500">G {meal.g}g</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function PreviewExercisesScreen({ isDark, primaryColor }: { isDark: boolean; primaryColor: string }) {
    const muted = mutedCls(isDark)
    const strong = strongCls(isDark)
    const cardBg = cardBgCls(isDark)
    const subtleBg = subtleBgCls(isDark)
    const px = (v: string) => pxMix(primaryColor, v)

    return (
        <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: px('10%') }}>
                    <Dumbbell className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className={cn('text-xs font-black tracking-tight', strong)}>Aprender Técnica</h2>
                    <p className={cn('text-[8px] font-medium', muted)}>Catálogo completo de ejercicios</p>
                </div>
                <Info className={cn('w-3.5 h-3.5', muted)} />
            </div>

            <div className={cn('flex items-center gap-2 rounded-xl px-3 py-2 border', subtleBg)}>
                <Search className={cn('w-3 h-3', muted)} />
                <span className={cn('text-[9px] font-medium', muted)}>Buscar ejercicio...</span>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {['Todos', 'Pecho', 'Espalda', 'Piernas'].map((p, i) => (
                    <span
                        key={p}
                        className={cn(
                            'text-[8px] font-bold px-2 py-1 rounded-full whitespace-nowrap border',
                            i === 0 ? 'text-white border-transparent' : isDark ? 'text-zinc-400 border-white/10' : 'text-zinc-600 border-zinc-200'
                        )}
                        style={i === 0 ? { backgroundColor: primaryColor } : undefined}
                    >
                        {p}
                    </span>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
                {[
                    { name: 'Press Banca', muscle: 'Pecho' },
                    { name: 'Remo Curvado', muscle: 'Espalda' },
                    { name: 'Sentadilla', muscle: 'Piernas' },
                    { name: 'Curl Bíceps', muscle: 'Bíceps' },
                ].map((ex) => (
                    <div key={ex.name} className={cn('rounded-xl border overflow-hidden', cardBg)}>
                        <div className={cn('aspect-[4/3] flex items-center justify-center', isDark ? 'bg-white/5' : 'bg-gray-100')}>
                            <ImageIcon className={cn('w-5 h-5', muted)} />
                        </div>
                        <div className="p-2">
                            <p className={cn('text-[7px] font-bold uppercase tracking-wider', muted)}>{ex.muscle}</p>
                            <p className={cn('text-[9px] font-extrabold mt-0.5 truncate', strong)}>{ex.name}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function PreviewCheckInScreen({ isDark, primaryColor }: { isDark: boolean; primaryColor: string }) {
    const muted = mutedCls(isDark)
    const strong = strongCls(isDark)
    const cardBg = cardBgCls(isDark)

    return (
        <div className="px-4 py-4 space-y-3">
            <div>
                <h2 className={cn('text-sm font-black tracking-tight', strong)}>Check-in Mensual</h2>
                <p className={cn('text-[9px] font-medium mt-0.5', muted)}>Registra tu progreso para que tu coach pueda ajustar tu plan.</p>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
                <p className="text-[8px] text-amber-700 dark:text-amber-200 leading-relaxed">
                    EVA no es un dispositivo médico ni sustituye el consejo de profesionales de la salud.
                </p>
            </div>

            <div className={cn('rounded-2xl p-3 border space-y-3', cardBg)}>
                <div className="space-y-1">
                    <label className={cn('text-[9px] font-bold', muted)}>Peso (kg)</label>
                    <div
                        className={cn(
                            'rounded-xl px-3 py-2 border text-sm font-black',
                            isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-gray-50 border-zinc-200 text-zinc-900'
                        )}
                    >
                        75.2
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <label className={cn('text-[9px] font-bold', muted)}>Nivel de energía</label>
                        <span className={cn('text-[9px] font-black', strong)}>7 / 10</span>
                    </div>
                    <div className="flex gap-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-1.5 flex-1 rounded-full"
                                style={{
                                    backgroundColor: i < 7 ? primaryColor : isDark ? 'rgba(255,255,255,0.1)' : '#e4e4e7',
                                }}
                            />
                        ))}
                    </div>
                </div>

                <div
                    className="w-full py-2 rounded-xl text-[10px] font-bold text-white text-center"
                    style={{ backgroundColor: primaryColor }}
                >
                    Guardar Check-in
                </div>
            </div>
        </div>
    )
}

/* ─── main component ─── */
export function BrandThemePreview({
    brandName,
    primaryColor,
    logoUrl,
    welcomeMessage,
    loaderText,
    useCustomLoader,
    loaderTextColor,
    loaderIconMode,
}: Props) {
    const [isDark, setIsDark] = useState(false)
    const [activeTab, setActiveTab] = useState('home')

    const muted = mutedCls(isDark)
    const strong = strongCls(isDark)

    const tabs = [
        { key: 'home', label: 'Inicio', icon: Home },
        { key: 'nutrition', label: 'Plan Alimenticio', icon: Apple },
        { key: 'exercises', label: 'Aprender', icon: Dumbbell },
        { key: 'checkin', label: 'Check-in', icon: CheckCircle },
    ]

    return (
        <div className="bg-card border border-border rounded-2xl p-6 space-y-5 shadow-sm">
            <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-foreground">Vista previa de tu app</h2>
                <button
                    type="button"
                    onClick={() => setIsDark(!isDark)}
                    className={cn(
                        'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                        isDark
                            ? 'bg-foreground text-background border-foreground'
                            : 'bg-secondary text-foreground border-border hover:border-primary/50'
                    )}
                >
                    {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                    {isDark ? 'Modo oscuro' : 'Modo claro'}
                </button>
            </div>

            {/* Mini phone mockup */}
            <div
                className={cn(
                    'mx-auto w-full max-w-[min(280px,85vw)] rounded-[28px] border-4 overflow-hidden flex flex-col',
                    isDark ? 'border-zinc-700 bg-[#121212]' : 'border-zinc-200 bg-white'
                )}
            >
                {/* Notch */}
                <div className="flex justify-center pt-2 pb-1">
                    <div className={cn('w-20 h-5 rounded-full', isDark ? 'bg-black' : 'bg-zinc-900')} />
                </div>

                {/* Login screen preview */}
                <div className="px-4 py-6 text-center space-y-4">
                    {logoUrl ? (
                        <div className="w-16 h-16 rounded-2xl overflow-hidden border mx-auto relative">
                            <Image src={logoUrl} alt={brandName} fill className="object-contain p-1.5" />
                        </div>
                    ) : (
                        <div
                            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-xl mx-auto"
                            style={{ backgroundColor: primaryColor }}
                        >
                            {brandName.charAt(0)}
                        </div>
                    )}
                    <div>
                        <p className={cn('font-bold text-lg', strong)}>{brandName}</p>
                        <p className={cn('text-[10px] mt-1', muted)}>
                            {welcomeMessage || 'Tu plataforma de entrenamiento personalizado'}
                        </p>
                    </div>
                    <div
                        className="w-full py-2 rounded-xl text-xs font-bold text-white"
                        style={{ backgroundColor: primaryColor }}
                    >
                        Ingresar al Panel
                    </div>
                </div>

                {/* Divider */}
                <div className={cn('h-px mx-4', isDark ? 'bg-white/10' : 'bg-zinc-200')} />

                {/* Dynamic screen content */}
                <div className="flex-1 min-h-[280px]">
                    {activeTab === 'home' && <PreviewHomeScreen isDark={isDark} primaryColor={primaryColor} brandName={brandName} />}
                    {activeTab === 'nutrition' && <PreviewNutritionScreen isDark={isDark} primaryColor={primaryColor} />}
                    {activeTab === 'exercises' && <PreviewExercisesScreen isDark={isDark} primaryColor={primaryColor} />}
                    {activeTab === 'checkin' && <PreviewCheckInScreen isDark={isDark} primaryColor={primaryColor} />}
                </div>

                {/* Bottom nav */}
                <div
                    className={cn(
                        'flex justify-around py-2 px-2 border-t',
                        isDark ? 'bg-white/5 border-white/10' : 'bg-white border-zinc-200'
                    )}
                >
                    {tabs.map(({ key, label, icon: Icon }) => {
                        const active = activeTab === key
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveTab(key)}
                                className="relative flex flex-col items-center gap-0.5 py-1 px-1 rounded-lg transition-colors"
                            >
                                {active && (
                                    <div
                                        className="absolute -top-2 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                                        style={{ backgroundColor: primaryColor }}
                                    />
                                )}
                                <Icon
                                    className={cn('w-5 h-5 transition-transform', active && 'scale-110')}
                                    style={
                                        active
                                            ? { color: primaryColor }
                                            : { color: isDark ? '#71717a' : '#a1a1aa' }
                                    }
                                />
                                <span
                                    className={cn('text-[8px] leading-none', active ? 'font-bold' : 'font-medium')}
                                    style={
                                        active
                                            ? { color: primaryColor }
                                            : { color: isDark ? '#71717a' : '#a1a1aa' }
                                    }
                                >
                                    {label}
                                </span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Loader preview */}
            <div className="rounded-xl border border-border p-4 bg-muted/50">
                <p className="text-xs text-muted-foreground mb-3 text-center">Así se ve al cargar la app de tus alumnos</p>
                <div className="flex items-center justify-center py-2">
                    <EvaRouteLoader
                        customText={loaderText}
                        useCustom={useCustomLoader}
                        textColor={loaderTextColor || undefined}
                        primaryColor={!loaderTextColor ? primaryColor : undefined}
                        iconMode={loaderIconMode}
                        size="sm"
                    />
                </div>
            </div>
        </div>
    )
}
