/** Datos ficticios para vitrinas públicas /landingpage4/prueba* y hero showcase */

export const DEMO_COACH = {
    fullName: 'Coach Demo',
    brandName: 'FORGE Training Lab',
    activeClients: 24,
    alerts: 2,
    sessionsThisWeek: 18,
} as const

export const DEMO_STUDENT = {
    brandName: 'FORGE Training Lab',
    greetingName: 'Alumno',
    streak: 12,
    checkInLabel: 'Pendiente',
    workoutTitle: 'Tren superior A',
    nutritionPlan: 'Plan de volumen',
    programTitle: 'Hipertrofía full body · 8 semanas',
    programProgressPct: 62,
    programWeekLabel: 'Semana 5 de 8',
} as const

export const DEMO_NAV_COACH = [
    { label: 'Dashboard', short: 'Inicio', active: true },
    { label: 'Alumnos', short: 'Alum.', active: false },
    { label: 'Programas', short: 'Prog.', active: false },
    { label: 'Ejercicios', short: 'Ejer.', active: false },
    { label: 'Nutrición', short: 'Nutri', active: false },
    { label: 'Mi marca', short: 'Marca', active: false },
] as const

export type DemoClientRow = {
    name: string
    initials: string
    adherence: number
    lastLog: string
    attention?: 'ok' | 'watch'
}

export const DEMO_CLIENT_ROWS: readonly DemoClientRow[] = [
    { name: 'Ana López', initials: 'AL', adherence: 91, lastLog: 'Hoy', attention: 'ok' },
    { name: 'Matías R.', initials: 'MR', adherence: 76, lastLog: 'Ayer', attention: 'watch' },
    { name: 'Valentina S.', initials: 'VS', adherence: 88, lastLog: 'Hoy', attention: 'ok' },
    { name: 'Diego P.', initials: 'DP', adherence: 62, lastLog: '5d', attention: 'watch' },
] as const

export type DemoProgramCard = { name: string; weeks: number; active: boolean }

export const DEMO_PROGRAMS: readonly DemoProgramCard[] = [
    { name: 'Fuerza 4 días', weeks: 8, active: true },
    { name: 'Definición verano', weeks: 6, active: false },
    { name: 'Hipertrofía A/B', weeks: 10, active: false },
] as const

export const DEMO_ACTIVITY_FEED = [
    { text: 'Nuevo check-in', when: 'Hoy' },
    { text: 'Plan actualizado', when: 'Ayer' },
    { text: 'Cliente invitado', when: 'Lun' },
] as const

export const DEMO_BRAND = {
    slug: 'demo-coach',
    hexColor: '#FF3B1F',
} as const
