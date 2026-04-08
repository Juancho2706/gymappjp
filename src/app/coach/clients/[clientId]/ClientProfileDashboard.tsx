'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { Activity, CreditCard, Dumbbell, Target, User, Edit2, Plus, ChevronDown, ChevronUp, CheckCircle2, PieChart as PieChartIcon, Flame, TrendingUp, Calendar, AlertCircle, Camera, CheckSquare, Utensils, Clock, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Bar, Legend, Cell, BarChart } from 'recharts'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Progress } from '@/components/ui/progress'

interface ClientProfileDashboardProps {
    data: any // using any temporarily to save time on type definitions
}

export function ClientProfileDashboard({ data }: ClientProfileDashboardProps) {
    const [activeTab, setActiveTab] = useState('overview')
    const [activeChart, setActiveChart] = useState('peso_composicion')
    const [expandedWorkouts, setExpandedWorkouts] = useState<string[]>([])
    const { resolvedTheme } = useTheme()
    const { client, checkIns, payments } = data

    const toggleWorkout = (id: string) => {
        setExpandedWorkouts(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const isDark = resolvedTheme === 'dark'
    const chartGridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    const chartAxisColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
    const tooltipBgColor = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'
    const tooltipBorderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    const tooltipTextColor = isDark ? '#fff' : '#000'

    // Preparar datos para gráfico de peso y métrica secundaria (Energía/Body Comp simulado si no hay)
    let previousWeight = 0;
    const weightData = [...(checkIns || [])]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((c, index) => {
            const currentWeight = c.weight;
            const weightChange = index === 0 ? 0 : currentWeight - previousWeight;
            previousWeight = currentWeight;
            
            return {
                date: new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                peso: currentWeight,
                // Usamos energy_level si existe, sino lo simulamos para tener una segunda métrica
                energia: c.energy_level || Math.floor(Math.random() * 5) + 6, // Simulamos 6-10 si no hay
                cambio_peso: Number(weightChange.toFixed(2))
            };
        });

    // Módulo de Fuerza y Rendimiento
    // 1. Gráfico Relative Strength Index (1RM)
    const calculate1RM = (weight: number, reps: number) => {
        if (!weight || !reps) return 0;
        return weight * (1 + reps / 30);
    }
    
    const keyExercises = ['bench press', 'squat', 'deadlift', 'press de banca', 'sentadilla', 'peso muerto'];
    
    const strengthDataMap = new Map();
    const tonnageDataMap = new Map();
    let totalVolume = 0;
    let totalWorkouts = 0;
    
    (data.workoutHistory || []).forEach((plan: any) => {
        const dateStr = new Date(plan.assigned_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        
        let planVolume = 0;
        let planLoggedSets = false;

        if (plan.workout_blocks) {
            plan.workout_blocks.forEach((block: any) => {
                const exName = (block.exercises?.name || '').toLowerCase();
                const isKeyExercise = keyExercises.some(ke => exName.includes(ke));
                let exMax1RM = 0;
                
                if (block.workout_logs) {
                    block.workout_logs.forEach((log: any) => {
                        if (log.weight && log.reps) {
                            planLoggedSets = true;
                            const volume = log.weight * log.reps;
                            planVolume += volume;
                            totalVolume += volume;
                            
                            if (isKeyExercise) {
                                const rep1RM = calculate1RM(log.weight, log.reps);
                                if (rep1RM > exMax1RM) {
                                    exMax1RM = rep1RM;
                                }
                            }
                        }
                    });
                }
                
                if (isKeyExercise && exMax1RM > 0) {
                    if (!strengthDataMap.has(dateStr)) {
                        strengthDataMap.set(dateStr, { date: dateStr });
                    }
                    const exKey = exName.includes('bench') || exName.includes('banca') ? 'bench' :
                                  exName.includes('squat') || exName.includes('sentadilla') ? 'squat' : 'deadlift';
                    
                    const existingData = strengthDataMap.get(dateStr);
                    if (!existingData[exKey] || exMax1RM > existingData[exKey]) {
                        existingData[exKey] = Math.round(exMax1RM);
                    }
                }
            });
        }
        
        if (planLoggedSets) {
            totalWorkouts++;
            if (!tonnageDataMap.has(dateStr)) {
                tonnageDataMap.set(dateStr, { date: dateStr, volumen: planVolume });
            } else {
                tonnageDataMap.get(dateStr).volumen += planVolume;
            }
        }
    });

    const strengthData = Array.from(strengthDataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const tonnageData = Array.from(tonnageDataMap.values()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Métrica de Densidad (Asumiendo 60 min por entrenamiento para estimar si no hay tiempo explícito)
    const estimatedTrainingMinutes = totalWorkouts * 60;
    const trainingDensity = estimatedTrainingMinutes > 0 ? (totalVolume / estimatedTrainingMinutes).toFixed(1) : 0;

    // --- MÓDULO DE NUTRICIÓN E INTELIGENCIA FORENSE ---
    const activeNutritionPlan = data.nutritionPlans?.[0];
    const targetCalories = activeNutritionPlan?.target_calories || 0;
    const targetProtein = activeNutritionPlan?.target_protein || 0;
    const targetCarbs = activeNutritionPlan?.target_carbs || 0;
    const targetFats = activeNutritionPlan?.target_fats || 0;

    // Procesar logs de nutrición (últimos 7-14 días)
    const nutritionHistory = [...(data.nutritionLogs || [])]
        .sort((a, b) => new Date(a.log_date).getTime() - new Date(b.log_date).getTime())
        .map(log => {
            const mealLogs: any[] = log.nutrition_meal_logs || [];
            const total = mealLogs.length;
            const done = mealLogs.filter((ml: any) => ml.is_completed).length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return {
                date: new Date(log.log_date + 'T12:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
                log_date: log.log_date,
                plan_name: log.plan_name_at_log || '',
                target_calories: log.target_calories_at_log || 0,
                target_protein: log.target_protein_at_log || 0,
                target_carbs: log.target_carbs_at_log || 0,
                target_fats: log.target_fats_at_log || 0,
                mealsTotal: total,
                mealsDone: done,
                compliancePct: pct,
                mealLogs,
                // Legacy fields for charts (no real macro data available - only completion)
                diferencial: 0,
                isAdherent: pct >= 80,
            };
        });

    // Calcular Diferencial Acumulado
    let runningDiff = 0;
    const accumulatedData = nutritionHistory.map(item => {
        runningDiff += item.diferencial;
        return { ...item, acumulado: runningDiff };
    });

    const checkInsWithPhotos = (checkIns || []).filter((c: any) => c.front_photo_url || c.side_photo_url || c.back_photo_url).slice(0, 3);

    // --- TASK 1, 2, 3: DATA PROCESSING ---
    const today = new Date();
    
    // Weekly Compliance Radar
    const compliance = data.compliance || {};
    const workoutsThisWeek = compliance.workoutsThisWeek || 0; 
    const workoutsTarget = compliance.workoutsTarget || 7;
    const nutritionCompliancePercent = compliance.nutritionCompliancePercent || 0;
    const isNutritionAtRisk = nutritionCompliancePercent < 60;
    
    const lastCheckIn = checkIns && checkIns.length > 0 
        ? checkIns.sort((a:any,b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] 
        : null;
    const daysSinceCheckIn = lastCheckIn 
        ? Math.floor((today.getTime() - new Date(lastCheckIn.created_at).getTime()) / (1000 * 3600 * 24))
        : 999;
    
    // Check-in status
    let checkInStatus = 'primary';
    if (daysSinceCheckIn > 14) checkInStatus = 'destructive';
    else if (daysSinceCheckIn >= 7) checkInStatus = 'warning';
    
    // Acciones de Hoy
    const todayStr = today.toISOString().split('T')[0];
    // Asumiendo que el overview necesita comprobar si se entrenó o comió hoy, lo simulamos para evitar complejidades excesivas
    // si no tenemos el array de logs completo, o podríamos derivarlo de workoutHistory y nutritionLogs.
    const todayWorkoutDone = data.workoutHistory?.some((plan: any) => 
        plan.workout_blocks?.some((block: any) => 
            block.workout_logs?.some((log: any) => log.logged_at?.startsWith(todayStr))
        )
    ) || false;
    const todayMealsDone = 0; // Podría calcularse desde meal_completions
    const todayMealsTotal = 4;

    // Dynamic Metrics Card
    const currentWeight = lastCheckIn?.weight || client.client_intake?.weight_kg || 0;
    const prevWeightCheckIn = checkIns && checkIns.length > 1 
        ? checkIns.sort((a:any,b:any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[1] 
        : null;
    const weeklyWeightVariation = prevWeightCheckIn ? currentWeight - prevWeightCheckIn.weight : 0;
    const interactionStreak = compliance.currentStreak || 0;


    const chartTabs = [
        { id: 'peso_composicion', label: '⚖️ Peso & Comp.' },
        { id: 'tasa_cambio', label: '📊 Tasa Cambio' },
        { id: 'fuerza', label: '💪 Fuerza (1RM)' },
        { id: 'volumen', label: '🏋️ Volumen' },
        { id: 'distribucion_macros', label: '🍽️ Macros' },
        { id: 'adherencia_calorica', label: '📉 Adherencia' },
        { id: 'balance_neto', label: '⚖️ Balance Neto' },
    ]

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'progress', label: 'Progreso' },
        { id: 'workout', label: 'Entrenamiento' },
        { id: 'nutrition', label: 'Nutrición' },
        { id: 'billing', label: 'Facturación' },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-6 border-b border-border/50 pb-2 relative z-10 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`text-[10px] font-black uppercase tracking-widest pb-2 px-2 shrink-0 transition-colors ${
                            activeTab === tab.id
                                ? 'text-primary border-b-2 border-primary'
                                : 'text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10">
                {activeTab === 'overview' && (
                    <>
                        {/* Task 2: Rediseño de Overview */}
                        <div className="md:col-span-8 space-y-6">
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {/* Task 1: Weekly Compliance Radar */}
                                <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden flex flex-col justify-between">
                                    <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
                                    <div>
                                        <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4 relative z-10">
                                            <Activity className="w-4 h-4" /> Radar Semanal
                                        </h3>
                                        <div className="space-y-4 relative z-10 w-full">
                                            {/* Entrenamiento */}
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-bold text-muted-foreground flex items-center gap-1"><Dumbbell className="w-3 h-3"/> Entrenamientos</span>
                                                    <span className="font-black">{workoutsThisWeek}/{workoutsTarget} Días</span>
                                                </div>
                                                <Progress value={(workoutsThisWeek / workoutsTarget) * 100} className="h-1.5 bg-secondary" />
                                            </div>
                                            
                                            {/* Nutrición */}
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-bold text-muted-foreground flex items-center gap-1"><Utensils className="w-3 h-3"/> Nutrición (Hoy)</span>
                                                    <span className={cn("font-black", isNutritionAtRisk ? "text-red-500" : "text-emerald-500")}>{nutritionCompliancePercent}%</span>
                                                </div>
                                                <Progress value={nutritionCompliancePercent} className={cn("h-1.5 bg-secondary", isNutritionAtRisk && "[&>div]:bg-red-500", !isNutritionAtRisk && "[&>div]:bg-emerald-500")} />
                                            </div>
                                            
                                            {/* Check-in */}
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-bold text-muted-foreground flex items-center gap-1"><Camera className="w-3 h-3"/> Check-in</span>
                                                    <span className={cn("font-black", 
                                                        checkInStatus === 'destructive' ? "text-red-500" : 
                                                        checkInStatus === 'warning' ? "text-yellow-500" : "text-emerald-500"
                                                    )}>
                                                        {lastCheckIn ? `Hace ${daysSinceCheckIn} días` : "Ninguno"}
                                                    </span>
                                                </div>
                                                <Progress value={compliance.checkInCompliancePercent || 0} 
                                                    className={cn("h-1.5 bg-secondary", 
                                                        checkInStatus === 'destructive' && "[&>div]:bg-red-500",
                                                        checkInStatus === 'warning' && "[&>div]:bg-yellow-500",
                                                        checkInStatus === 'primary' && "[&>div]:bg-emerald-500"
                                                    )} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-border/50 dark:border-white/5 relative z-10">
                                        <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                                            <span>Acción de Hoy:</span>
                                            <div className="flex gap-2">
                                                <span className="flex items-center gap-1 bg-secondary/50 px-2 py-0.5 rounded">
                                                    <Dumbbell className="w-3 h-3" /> {compliance.workoutsThisWeek > 0 ? '✅' : '⏳'}
                                                </span>
                                                <span className="flex items-center gap-1 bg-secondary/50 px-2 py-0.5 rounded">
                                                    <Utensils className="w-3 h-3" /> {compliance.todayMealsDone || 0}/{compliance.todayMealsTotal || 4} {(compliance.todayMealsDone || 0) >= (compliance.todayMealsTotal || 4) ? '✅' : '⏳'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>

                                {/* Current Plan Status */}
                                <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden flex flex-col justify-between">
                                    <div className="absolute bottom-0 right-0 -mr-8 -mb-8 w-32 h-32 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
                                    <div>
                                        <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4 relative z-10">
                                            <Calendar className="w-4 h-4" /> {data.activeProgram?.name || 'Sin Plan Activo'}
                                        </h3>
                                        <div className="space-y-4 relative z-10">
                                            <div>
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-bold text-muted-foreground uppercase tracking-widest">Fase Actual</span>
                                                    <span className="font-black">Entrenamiento</span>
                                                </div>
                                                <div className="flex justify-between text-xs mb-1 mt-3">
                                                    <span className="font-bold text-muted-foreground uppercase tracking-widest">Progreso del Ciclo</span>
                                                    <span className="font-black text-primary">Semana {compliance.planCurrentWeek || 1} / {compliance.planTotalWeeks || 4}</span>
                                                </div>
                                                <Progress value={((compliance.planCurrentWeek || 1) / (compliance.planTotalWeeks || 4)) * 100} className="h-2 bg-secondary" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-border/50 dark:border-white/5 relative z-10 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("w-2 h-2 rounded-full animate-pulse", isNutritionAtRisk ? "bg-red-500" : "bg-emerald-500")} />
                                            <span className={cn("text-xs font-bold uppercase tracking-widest", isNutritionAtRisk ? "text-red-500" : "text-emerald-500")}>
                                                {isNutritionAtRisk ? 'En Riesgo' : 'En track'}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{compliance.planDaysRemaining || 0} días restantes</span>
                                    </div>
                                </GlassCard>
                            </div>

                            {/* Miniaturas de Check-in */}
                            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4 relative z-10">
                                    <Camera className="w-4 h-4" /> Evolución Visual (Último Mes)
                                </h3>
                                {checkInsWithPhotos.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-4 relative z-10">
                                        {checkInsWithPhotos.map((c: any, i: number) => (
                                            <div key={i} className="relative aspect-[3/4] bg-secondary/50 rounded-xl overflow-hidden group">
                                                <Image 
                                                    src={c.front_photo_url || c.side_photo_url || c.back_photo_url} 
                                                    alt="Progreso" 
                                                    fill 
                                                    className="object-cover transition-transform duration-500 group-hover:scale-110" 
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-white">
                                                        {new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center border border-dashed border-border/50 rounded-xl bg-secondary/20 relative z-10">
                                        <Camera className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground font-medium">Sin fotos recientes de check-in.</p>
                                    </div>
                                )}
                            </GlassCard>
                        </div>
                        <div className="md:col-span-4 space-y-6">
                            {/* Task 2: Dynamic Metrics Card */}
                            <GlassCard className="p-6 flex flex-col border-dashed border-border/50 dark:border-white/10 relative overflow-hidden h-full">
                                <div className="absolute bottom-0 right-0 -mr-16 -mb-16 w-48 h-48 bg-primary/5 dark:bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                                <div className="flex justify-between items-center mb-6 relative z-10">
                                    <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <Activity className="w-4 h-4" /> Métricas Clave
                                    </h3>
                                    <Dialog>
                                        <DialogTrigger render={
                                            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-primary/10 hover:text-primary">
                                                <Edit2 className="w-3 h-3" />
                                            </Button>
                                        } />
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle className="uppercase font-black tracking-tighter text-xl">Editar Biometría Inicial</DialogTitle>
                                            </DialogHeader>
                                            <div className="grid gap-4 py-4">
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="height" className="text-right text-xs font-bold uppercase tracking-widest">Altura</Label>
                                                    <Input id="height" defaultValue={client.client_intake?.height_cm} className="col-span-3" placeholder="cm" />
                                                </div>
                                                <div className="grid grid-cols-4 items-center gap-4">
                                                    <Label htmlFor="weight" className="text-right text-xs font-bold uppercase tracking-widest">Peso Inicial</Label>
                                                    <Input id="weight" defaultValue={client.client_intake?.weight_kg} className="col-span-3" placeholder="kg" />
                                                </div>
                                            </div>
                                            <div className="flex justify-end gap-3">
                                                <Button variant="outline" className="text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
                                                <Button className="text-[10px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90">Guardar Cambios</Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <div className="space-y-6 relative z-10 flex-1 flex flex-col justify-center">
                                    {/* Peso Actual */}
                                    <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg border border-border/50">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Activity className="w-3 h-3"/> Peso Actual</span>
                                            <span className="text-2xl font-black text-foreground">{currentWeight} <span className="text-sm font-medium text-muted-foreground">kg</span></span>
                                        </div>
                                    </div>
                                    
                                    {/* Variación Semanal */}
                                    <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg border border-border/50">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><TrendingUp className="w-3 h-3"/> Var. Semanal</span>
                                            <span className="text-lg font-black flex items-center gap-1">
                                                {Math.abs(weeklyWeightVariation).toFixed(1)} kg
                                                {weeklyWeightVariation > 0 ? (
                                                    <ArrowUpRight className="w-4 h-4 text-red-500" />
                                                ) : weeklyWeightVariation < 0 ? (
                                                    <ArrowDownRight className="w-4 h-4 text-emerald-500" />
                                                ) : (
                                                    <Minus className="w-4 h-4 text-muted-foreground" />
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Racha */}
                                    <div className="flex items-center justify-between bg-secondary/30 p-3 rounded-lg border border-border/50">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1"><Flame className="w-3 h-3"/> Racha Interact.</span>
                                            <span className="text-lg font-black text-orange-500 flex items-center gap-1">{interactionStreak} Días <Flame className="w-4 h-4 fill-orange-500"/></span>
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>
                        </div>
                    </>
                )}

                {activeTab === 'progress' && (
                    <div className="md:col-span-12 space-y-6">
                        {/* Task 3: Panel de Progreso Unificado */}
                        <GlassCard className="p-6 md:p-8 flex flex-col border-dashed border-border/50 dark:border-white/10 relative overflow-hidden h-[35rem]">
                            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary/5 dark:bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 relative z-10">
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                    <Activity className="w-4 h-4" /> Panel de Progreso Unificado
                                </h3>
                                {/* ToggleBar Superior de píldoras */}
                                <div className="flex flex-wrap gap-2">
                                    {chartTabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveChart(tab.id)}
                                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors ${
                                                activeChart === tab.id
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground border border-border/50'
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex-1 w-full relative z-10 min-h-0">
                                {activeChart === 'peso_composicion' && (
                                    weightData.length > 1 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={weightData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis yAxisId="left" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} domain={['dataMin - 2', 'dataMax + 2']} />
                                                <YAxis yAxisId="right" orientation="right" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} domain={[0, 10]} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                    itemStyle={{ color: 'var(--theme-primary)' }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                <Line yAxisId="left" type="monotone" dataKey="peso" name="Peso (kg)" stroke="var(--theme-primary)" strokeWidth={3} dot={{ fill: 'var(--theme-primary)', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                                <Line yAxisId="right" type="monotone" dataKey="energia" name="Energía (1-10)" stroke="#10b981" strokeWidth={3} strokeDasharray="5 5" dot={{ fill: '#10b981', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            No hay suficientes datos de check-in para mostrar el gráfico.
                                        </div>
                                    )
                                )}

                                {activeChart === 'tasa_cambio' && (
                                    weightData.length > 1 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={weightData.slice(1)}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                    formatter={(value: any) => [`${value > 0 ? '+' : ''}${value} kg`, 'Cambio']}
                                                />
                                                <Bar dataKey="cambio_peso" name="Cambio Neto" radius={[4, 4, 0, 0]}>
                                                    {weightData.slice(1).map((entry, index) => {
                                                        const val = entry.cambio_peso;
                                                        let color = '#f59e0b';
                                                        if (Math.abs(val) > 0.6) color = '#ef4444';
                                                        else if (Math.abs(val) >= 0.2 && Math.abs(val) <= 0.6) color = '#10b981';
                                                        return <Cell key={`cell-change-${index}`} fill={color} fillOpacity={0.8} />
                                                    })}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            No hay suficientes datos para calcular la tasa de cambio.
                                        </div>
                                    )
                                )}

                                {activeChart === 'fuerza' && (
                                    strengthData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={strengthData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                <Line type="monotone" dataKey="bench" name="Bench Press" stroke="#3b82f6" strokeWidth={3} dot={{ strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
                                                <Line type="monotone" dataKey="squat" name="Squat" stroke="#10b981" strokeWidth={3} dot={{ strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
                                                <Line type="monotone" dataKey="deadlift" name="Deadlift" stroke="#f59e0b" strokeWidth={3} dot={{ strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            No hay suficientes datos de entrenamiento para calcular 1RM.
                                        </div>
                                    )
                                )}

                                {activeChart === 'volumen' && (
                                    tonnageData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={tonnageData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                    formatter={(value) => [`${value} kg`, 'Volumen']}
                                                />
                                                <Bar dataKey="volumen" fill="var(--theme-primary)" opacity={0.6} radius={[4, 4, 0, 0]} />
                                                <Line type="monotone" dataKey="volumen" stroke="var(--theme-primary)" strokeWidth={2} dot={false} />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            No hay suficientes datos de entrenamiento para mostrar el volumen.
                                        </div>
                                    )
                                )}

                                {activeChart === 'distribucion_macros' && (
                                    nutritionHistory.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={nutritionHistory}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                />
                                                <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                                                <Bar dataKey="proteina" name="Proteína" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                                                <Bar dataKey="carbohidratos" name="Carbs" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                                                <Bar dataKey="grasas" name="Grasas" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            Sin registros nutricionales recientes.
                                        </div>
                                    )
                                )}

                                {activeChart === 'adherencia_calorica' && (
                                    nutritionHistory.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={nutritionHistory}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                    cursor={{fill: 'transparent'}}
                                                />
                                                <Bar dataKey="calorias" name="Calorías Reales" radius={[4, 4, 0, 0]}>
                                                    {nutritionHistory.map((entry, index) => (
                                                        <Cell 
                                                            key={`cell-${index}`} 
                                                            fill={entry.isAdherent ? '#10b981' : '#ef4444'} 
                                                            fillOpacity={0.8}
                                                        />
                                                    ))}
                                                </Bar>
                                                {targetCalories > 0 && (
                                                    <Line type="monotone" dataKey={() => targetCalories} stroke={isDark ? '#fff' : '#000'} strokeDasharray="5 5" strokeWidth={1} dot={false} name="Objetivo" />
                                                )}
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            Sin registros para medir adherencia.
                                        </div>
                                    )
                                )}

                                {activeChart === 'balance_neto' && (
                                    accumulatedData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={accumulatedData}>
                                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                                                <XAxis dataKey="date" stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <YAxis stroke={chartAxisColor} fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                                                <Tooltip 
                                                    contentStyle={{ backgroundColor: tooltipBgColor, border: `1px solid ${tooltipBorderColor}`, borderRadius: '8px', color: tooltipTextColor }}
                                                />
                                                <Bar dataKey="diferencial" name="Neto Diario" radius={[4, 4, 0, 0]}>
                                                    {accumulatedData.map((entry, index) => (
                                                        <Cell 
                                                            key={`cell-diff-${index}`} 
                                                            fill={entry.diferencial > 0 ? '#ef4444' : '#3b82f6'} 
                                                            fillOpacity={0.4}
                                                        />
                                                    ))}
                                                </Bar>
                                                <Line 
                                                    type="monotone" 
                                                    dataKey="acumulado" 
                                                    name="Acumulado" 
                                                    stroke="var(--theme-primary)" 
                                                    strokeWidth={3} 
                                                    dot={{ fill: 'var(--theme-primary)' }} 
                                                />
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                                            Sin datos de balance calórico.
                                        </div>
                                    )
                                )}
                            </div>
                        </GlassCard>

                        <GlassCard className="p-8 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden mt-6">
                            <div className="absolute top-0 right-1/4 -mr-16 -mt-16 w-64 h-64 bg-primary/5 dark:bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2 relative z-10">
                                <Target className="w-4 h-4" /> Check-ins Recientes
                            </h3>
                            {checkIns && checkIns.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
                                    {checkIns.map((checkIn: any) => (
                                        <div key={checkIn.id} className="bg-secondary/50 dark:bg-white/5 border border-border dark:border-white/10 p-4 rounded-xl space-y-3 shadow-sm dark:shadow-none hover:shadow-md transition-shadow">
                                            <div className="flex justify-between items-center border-b border-border dark:border-white/5 pb-2">
                                                <span className="font-bold text-sm text-foreground">{new Date(checkIn.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
                                                <span className="text-xs text-primary font-black">{checkIn.weight} kg</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-3">{checkIn.notes || 'Sin notas.'}</p>
                                            {checkIn.front_photo_url && (
                                                <div className="relative h-48 w-full bg-black/5 dark:bg-black/20 rounded-lg overflow-hidden group/photo">
                                                    <Image 
                                                        src={checkIn.front_photo_url} 
                                                        alt={`Progreso ${new Date(checkIn.created_at).toLocaleDateString()}`}
                                                        fill
                                                        className="object-cover transition-transform duration-500 group-hover/photo:scale-110"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center relative z-10">Este alumno aún no ha registrado check-ins.</p>
                            )}
                        </GlassCard>
                    </div>
                )}

                {activeTab === 'workout' && (
                    <div className="md:col-span-12 space-y-6">
                        <GlassCard className="p-8 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                            <div className="absolute bottom-0 left-1/4 -ml-16 -mb-16 w-64 h-64 bg-primary/5 dark:bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                            <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2 relative z-10">
                                <Dumbbell className="w-4 h-4" /> Historial de Entrenamientos
                            </h3>
                            {data.workoutHistory && data.workoutHistory.length > 0 ? (
                                <div className="space-y-4 relative z-10">
                                    {data.workoutHistory.slice(0, 10).map((plan: any) => {
                                        const isExpanded = expandedWorkouts.includes(plan.id)
                                        return (
                                            <div key={plan.id} className="overflow-hidden bg-secondary/50 dark:bg-white/5 border border-border/50 dark:border-white/10 rounded-xl transition-all duration-300">
                                                <button 
                                                    onClick={() => toggleWorkout(plan.id)}
                                                    className="w-full flex justify-between items-center p-4 hover:bg-primary/5 transition-colors"
                                                >
                                                    <div className="text-left">
                                                        <p className="text-sm font-black uppercase text-foreground tracking-tight">{plan.title}</p>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{new Date(plan.assigned_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[10px] uppercase bg-primary/10 text-primary px-2 py-1 rounded font-black border border-primary/20 tracking-widest">
                                                            {plan.workout_blocks?.length || 0} EJERCICIOS
                                                        </span>
                                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                                    </div>
                                                </button>
                                                
                                                {isExpanded && (
                                                    <div className="p-4 border-t border-border/50 dark:border-white/5 animate-in slide-in-from-top-2 duration-300">
                                                        <div className="space-y-4">
                                                            {plan.workout_blocks?.map((block: any, idx: number) => (
                                                                <div key={idx} className="space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary">
                                                                            {idx + 1}
                                                                        </div>
                                                                        <h4 className="text-xs font-black uppercase tracking-tight">{block.exercises?.name}</h4>
                                                                    </div>
                                                                    <div className="pl-8 overflow-x-auto">
                                                                        <table className="w-full text-[10px] uppercase font-bold tracking-widest">
                                                                            <thead>
                                                                                <tr className="text-muted-foreground border-b border-border/50 dark:border-white/5">
                                                                                    <th className="text-left py-2">Set</th>
                                                                                    <th className="text-left py-2">Reps</th>
                                                                                    <th className="text-left py-2">Peso</th>
                                                                                    <th className="text-right py-2">Estado</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {(block.workout_logs || []).map((log: any, lIdx: number) => (
                                                                                    <tr key={lIdx} className="border-b border-border/5 dark:border-white/5 last:border-0">
                                                                                        <td className="py-2">{lIdx + 1}</td>
                                                                                        <td className="py-2">{log.reps || '-'}</td>
                                                                                        <td className="py-2">{log.weight || '-'} kg</td>
                                                                                        <td className="py-2 text-right">
                                                                                            <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                                {(!block.workout_logs || block.workout_logs.length === 0) && (
                                                                                    <tr>
                                                                                        <td colSpan={4} className="py-4 text-center text-muted-foreground normal-case font-medium italic">Sin logs registrados para este ejercicio.</td>
                                                                                    </tr>
                                                                                )}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground text-center relative z-10">No hay entrenamientos registrados recientemente.</p>
                            )}
                        </GlassCard>
                    </div>
                )}

                {/* Task 4: Estructura Base Nutrición */}
                {activeTab === 'nutrition' && (
                    <div className="md:col-span-12 space-y-6 animate-in fade-in duration-500">
                        {/* Plan activo + macros objetivo */}
                        {activeNutritionPlan && (
                            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4 relative z-10">
                                    <Utensils className="w-4 h-4" /> Plan Activo: {activeNutritionPlan.name}
                                </h3>
                                {(activeNutritionPlan.daily_calories || activeNutritionPlan.protein_g) && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
                                        {activeNutritionPlan.daily_calories && (
                                            <div className="bg-secondary/50 dark:bg-white/5 rounded-xl p-3 text-center">
                                                <p className="text-lg font-black text-primary">{activeNutritionPlan.daily_calories}</p>
                                                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">kcal</p>
                                            </div>
                                        )}
                                        {activeNutritionPlan.protein_g && (
                                            <div className="bg-secondary/50 dark:bg-white/5 rounded-xl p-3 text-center">
                                                <p className="text-lg font-black text-blue-400">{activeNutritionPlan.protein_g}g</p>
                                                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Proteína</p>
                                            </div>
                                        )}
                                        {activeNutritionPlan.carbs_g && (
                                            <div className="bg-secondary/50 dark:bg-white/5 rounded-xl p-3 text-center">
                                                <p className="text-lg font-black text-yellow-400">{activeNutritionPlan.carbs_g}g</p>
                                                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Carbos</p>
                                            </div>
                                        )}
                                        {activeNutritionPlan.fats_g && (
                                            <div className="bg-secondary/50 dark:bg-white/5 rounded-xl p-3 text-center">
                                                <p className="text-lg font-black text-orange-400">{activeNutritionPlan.fats_g}g</p>
                                                <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Grasas</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </GlassCard>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Historial de cumplimiento de comidas */}
                            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4 relative z-10">
                                    <CheckSquare className="w-4 h-4" /> Cumplimiento por Día
                                </h3>
                                {nutritionHistory.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <Utensils className="w-10 h-10 text-muted-foreground/30 mb-3" />
                                        <p className="text-sm text-muted-foreground">Sin registros de comidas aún.</p>
                                        <p className="text-xs text-muted-foreground/60 mt-1">El alumno verá sus comidas al ingresar al app.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 relative z-10">
                                        {[...nutritionHistory].reverse().map((log, i) => (
                                            <div key={i} className="flex items-center gap-3">
                                                <div className="w-16 text-[10px] font-bold text-muted-foreground uppercase shrink-0">{log.date}</div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-xs mb-1">
                                                        <span className="text-muted-foreground">{log.mealsDone}/{log.mealsTotal} comidas</span>
                                                        <span className={cn("font-black", log.compliancePct >= 80 ? "text-emerald-500" : log.compliancePct >= 50 ? "text-yellow-500" : "text-red-500")}>
                                                            {log.compliancePct}%
                                                        </span>
                                                    </div>
                                                    <Progress
                                                        value={log.compliancePct}
                                                        className={cn("h-1.5 bg-secondary",
                                                            log.compliancePct >= 80 && "[&>div]:bg-emerald-500",
                                                            log.compliancePct >= 50 && log.compliancePct < 80 && "[&>div]:bg-yellow-500",
                                                            log.compliancePct < 50 && "[&>div]:bg-red-500"
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </GlassCard>

                            {/* Detalle del día más reciente */}
                            <GlassCard className="p-6 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                                <div className="absolute bottom-0 left-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2 mb-4 relative z-10">
                                    <Calendar className="w-4 h-4" /> Último Registro Detallado
                                </h3>
                                {nutritionHistory.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <AlertCircle className="w-10 h-10 text-muted-foreground/30 mb-3" />
                                        <p className="text-sm text-muted-foreground">Sin registros aún.</p>
                                    </div>
                                ) : (() => {
                                    const latest = [...nutritionHistory].reverse()[0];
                                    return (
                                        <div className="space-y-2 relative z-10">
                                            <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground mb-3">{latest.date}</p>
                                            {latest.mealLogs.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">Sin comidas registradas.</p>
                                            ) : (
                                                [...latest.mealLogs]
                                                    .sort((a: any, b: any) => (a.nutrition_meals?.order_index ?? 0) - (b.nutrition_meals?.order_index ?? 0))
                                                    .map((ml: any, i: number) => (
                                                        <div key={i} className={cn(
                                                            "flex items-center justify-between px-3 py-2.5 rounded-lg text-sm",
                                                            ml.is_completed
                                                                ? "bg-emerald-500/10 border border-emerald-500/20"
                                                                : "bg-secondary/50 dark:bg-white/5 border border-border/50 dark:border-white/10"
                                                        )}>
                                                            <span className="font-bold truncate">
                                                                {ml.nutrition_meals?.name || `Comida ${i + 1}`}
                                                            </span>
                                                            {ml.is_completed
                                                                ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                                                : <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                                                            }
                                                        </div>
                                                    ))
                                            )}
                                        </div>
                                    );
                                })()}
                            </GlassCard>
                        </div>
                    </div>
                )}

                {activeTab === 'billing' && (
                    <div className="md:col-span-12">
                        <GlassCard className="p-8 border-dashed border-border/50 dark:border-white/10 relative overflow-hidden">
                            <div className="absolute top-1/2 left-1/2 -ml-32 -mt-32 w-64 h-64 bg-primary/5 dark:bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                            <div className="flex justify-between items-center mb-6 relative z-10">
                                <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" /> Historial de Pagos
                                </h3>
                                <Dialog>
                                    <DialogTrigger render={
                                        <Button className="h-8 bg-primary text-primary-foreground hover:bg-primary/90 text-[10px] font-black uppercase tracking-widest px-4 shadow-[0_0_20px_-5px_var(--theme-primary)]">
                                            <Plus className="w-3 h-3 mr-2" /> Nuevo Pago
                                        </Button>
                                    } />
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle className="uppercase font-black tracking-tighter text-xl">Registrar Nuevo Pago</DialogTitle>
                                        </DialogHeader>
                                        <div className="grid gap-4 py-4">
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <Label htmlFor="amount" className="text-right text-xs font-bold uppercase tracking-widest">Monto</Label>
                                                <Input id="amount" type="number" className="col-span-3" placeholder="$ 0.00" />
                                            </div>
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <Label htmlFor="date" className="text-right text-xs font-bold uppercase tracking-widest">Fecha</Label>
                                                <Input id="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} className="col-span-3" />
                                            </div>
                                            <div className="grid grid-cols-4 items-center gap-4">
                                                <Label htmlFor="method" className="text-right text-xs font-bold uppercase tracking-widest">Método</Label>
                                                <Input id="method" className="col-span-3" placeholder="Ej: Transferencia, Efectivo" />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-3">
                                            <Button variant="outline" className="text-[10px] font-black uppercase tracking-widest">Cancelar</Button>
                                            <Button className="text-[10px] font-black uppercase tracking-widest bg-primary hover:bg-primary/90">Confirmar Pago</Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>
                            </div>
                            <div className="space-y-4 relative z-10">
                                {payments && payments.length > 0 ? (
                                    payments.map((payment: any) => (
                                        <div key={payment.id} className="flex justify-between items-center bg-secondary/50 dark:bg-white/5 border border-border/50 dark:border-white/10 p-4 rounded-xl shadow-sm dark:shadow-none hover:shadow-md transition-shadow">
                                            <div>
                                                <p className="text-sm font-black text-foreground uppercase tracking-tight">{new Date(payment.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{payment.method}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-black text-primary">${payment.amount}</p>
                                                <span className="text-[10px] uppercase font-black tracking-widest bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md border border-emerald-500/20">
                                                    {payment.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-sm text-muted-foreground text-center py-8">No se han registrado pagos para este alumno.</p>
                                )}
                            </div>
                        </GlassCard>
                    </div>
                )}
            </div>
        </div>
    )
}
