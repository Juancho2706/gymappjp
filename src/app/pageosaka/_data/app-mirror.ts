/** Copy y rutas alineadas al producto real (solo referencia en el especimen Osaka). */

export const routes = {
  planBuilderClient: "/coach/builder/[clientId]",
  planBuilderTemplate: "/coach/workout-programs/builder",
  nutritionClientPlan: "/coach/nutrition-plans/client/[clientId]",
  nutritionLegacyRedirect: "/coach/nutrition-builder/[clientId] → redirect",
  nutritionPlansHub: "/coach/nutrition-plans",
  clientDashboard: "/c/[coach_slug]/dashboard",
  coachDashboard: "/coach/dashboard",
} as const;

export const coachBuilderBullets = [
  "Semana por columnas (Lun–Dom) con variantes A/B y fases del programa.",
  "Arrastra bloques y ejercicios (dnd-kit): catálogo en sheet móvil o sidebar tablet/desktop.",
  "Por ejercicio: series, reps, peso objetivo, tempo, RIR/RPE, descanso, notas, superseries.",
  "Acciones: plantillas, vista previa, asignar (plantillas), balance muscular, imprimir/PDF, deshacer/rehacer.",
  "Guardado con validación: nombre, al menos un ejercicio, series/reps completas.",
] as const;

export const nutritionBuilderBullets = [
  "Editor `PlanBuilder`: sidebar (nombre, kcal + macros objetivo, instrucciones, guardar) + lienzo de comidas.",
  "Comidas ordenables; cada comida abre búsqueda de alimentos (drawer) con cantidad y unidad (g o unidades).",
  "Totales reales vs meta; botón para sincronizar objetivos con lo construido.",
  "Vista alumno en `/c/.../nutrition`: marcar comidas, macros del día, adherencia.",
] as const;

export const clientDashboardBullets = [
  "`DashboardShell`: cabecera de marca, `WeekCalendar`, banner de check-in, grupo hero + adherencia.",
  "`WorkoutHeroCard` o `RestDayCard`: entreno del día o próximo día con bloques y progreso de series.",
  "`ActiveProgramSection`, `RecentWorkoutsSection`, `WeightFullChartSection`.",
  "Sidebar (`DashboardSidebarBlocks`): anillos de cumplimiento, nutrición del día, PRs, racha, etc.",
] as const;

export const coachHomeBullets = [
  "KPIs: MRR estimado (CLP), total alumnos, planes activos; delta vs mes anterior.",
  "`DashboardCharts`: adherencia entreno vs macros (recharts), modales de detalle.",
  "Listas: programas por vencer, clientes en riesgo, actividad reciente (workouts, check-ins).",
  "`CreateClientModal`, checklist de onboarding coach, banners de suscripción / trial.",
] as const;

export const builderDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export const builderExerciseRows = [
  { letter: "A", name: "Sentadilla trasera", sets: 4, reps: "6–8", kg: "100", rest: "180s", note: "Profundidad" },
  { letter: "B", name: "Press banca", sets: 3, reps: "8–10", kg: "80", rest: "120s", tempo: "3-1-X-1" },
] as const;

export const nutritionMealsPreview = [
  {
    name: "Desayuno",
    items: [
      { food: "Avena integral", qty: "80", unit: "g" },
      { food: "Proteína whey", qty: "30", unit: "g" },
    ],
  },
  {
    name: "Comida 2",
    items: [
      { food: "Pechuga de pollo", qty: "200", unit: "g" },
      { food: "Arroz basmati", qty: "150", unit: "g" },
    ],
  },
] as const;
