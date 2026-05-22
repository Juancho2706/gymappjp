import type { OrgWithMembership, OrgMember, OrgClient } from '@/infrastructure/db/org.repository'

// ─── Brand ───────────────────────────────────────────────────────────────────

export const MOVIDA_BRAND = {
    name: 'Movida',
    slug: 'movida',
    legalName: 'Movida Centro de Salud Integral',
    rut: '76.412.837-5',
    domain: 'movida.cl',
    city: 'Viña del Mar',
    address: '4 Poniente 167, Viña del Mar, Chile',
    phone: '+56 9 3264 2144',
    email: 'contacto@movida.cl',
    primaryColor: '#0D9488',
    accentColor: '#F59E0B',
    logoUrl: '/logomovida.png',
    tagline: 'El movimiento, es vida',
    welcomeMessage: 'Bienvenido a Movida — tu centro de salud integral en Viña del Mar.',
    description: 'Centro de salud integral con kinesiología, entrenamientos deportivos, quiropraxia, osteopatía, psicología deportiva, nutrición y rehabilitación vestibular.',
} as const

// ─── Org ─────────────────────────────────────────────────────────────────────

export const movidaOrg: OrgWithMembership = {
    id: 'org-movida-001',
    slug: 'movida',
    name: 'Movida',
    logo_url: '/logomovida.png',
    primary_color: '#0D9488',
    plan: 'enterprise',
    status: 'active',
    seats_included: 12,
    trial_ends_at: null,
    billing_cycle: 'mensual',
    currency: 'CLP',
    created_at: '2025-03-01T10:00:00Z',
    onboarding_step: 5,
    last_health_score: 87,
    myRole: 'org_owner',
}

export const movidaOrgStats = {
    totalCoaches: 8,
    pendingInvites: 2,
    totalClients: 120,
    activeClients: 98,
}

// ─── Coaches ─────────────────────────────────────────────────────────────────

export type DemoCoach = {
    id: string
    user_id: string
    full_name: string
    email: string
    slug: string
    specialty: string
    invite_code: string
    logo_url: string | null
    subscription_status: string
    clients_count: number
    role: 'org_owner' | 'org_admin' | 'coach'
    status: 'active' | 'invited' | 'pending'
    joined_at: string | null
    invited_at: string | null
    phone: string
}

export const movidaCoaches: DemoCoach[] = [
    {
        id: 'coach-felipe-001',
        user_id: 'user-felipe-001',
        full_name: 'Felipe Martínez',
        email: 'felipe@movida.cl',
        slug: 'felipe-movida',
        specialty: 'Kinesiólogo | Entrenamiento Funcional',
        invite_code: 'MVFELI',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 28,
        role: 'org_owner',
        status: 'active',
        joined_at: '2025-03-01T10:00:00Z',
        invited_at: null,
        phone: '+56 9 8821 4432',
    },
    {
        id: 'coach-camila-002',
        user_id: 'user-camila-002',
        full_name: 'Camila Rojas',
        email: 'camila@movida.cl',
        slug: 'camila-movida',
        specialty: 'Nutricionista Deportiva',
        invite_code: 'MVCAMI',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 22,
        role: 'org_admin',
        status: 'active',
        joined_at: '2025-03-05T09:00:00Z',
        invited_at: null,
        phone: '+56 9 7714 5523',
    },
    {
        id: 'coach-diego-003',
        user_id: 'user-diego-003',
        full_name: 'Diego Pérez',
        email: 'diego@movida.cl',
        slug: 'diego-movida',
        specialty: 'Kinesiólogo | Rehabilitación',
        invite_code: 'MVDIEG',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 18,
        role: 'coach',
        status: 'active',
        joined_at: '2025-03-08T11:30:00Z',
        invited_at: null,
        phone: '+56 9 6698 3341',
    },
    {
        id: 'coach-catalina-004',
        user_id: 'user-catalina-004',
        full_name: 'Catalina Soto',
        email: 'catalina@movida.cl',
        slug: 'catalina-movida',
        specialty: 'Psicóloga Deportiva',
        invite_code: 'MVCATA',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 15,
        role: 'coach',
        status: 'active',
        joined_at: '2025-03-15T14:00:00Z',
        invited_at: null,
        phone: '+56 9 9902 7781',
    },
    {
        id: 'coach-joaquin-005',
        user_id: 'user-joaquin-005',
        full_name: 'Joaquín Bravo',
        email: 'joaquin@movida.cl',
        slug: 'joaquin-movida',
        specialty: 'Entrenador | Fuerza y Acondicionamiento',
        invite_code: 'MVJOAQ',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 20,
        role: 'coach',
        status: 'active',
        joined_at: '2025-04-01T08:00:00Z',
        invited_at: null,
        phone: '+56 9 5571 2234',
    },
    {
        id: 'coach-antonia-006',
        user_id: 'user-antonia-006',
        full_name: 'Antonia Muñoz',
        email: 'antonia@movida.cl',
        slug: 'antonia-movida',
        specialty: 'Osteopata | Quiropraxia',
        invite_code: 'MVANTO',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 14,
        role: 'coach',
        status: 'active',
        joined_at: '2025-04-10T10:00:00Z',
        invited_at: null,
        phone: '+56 9 4488 6612',
    },
    {
        id: 'coach-vicente-007',
        user_id: 'user-vicente-007',
        full_name: 'Vicente Castro',
        email: 'vicente.c@movida.cl',
        slug: 'vicente-movida',
        specialty: 'Kinesiólogo | Rehabilitación Vestibular',
        invite_code: 'MVVICE',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 12,
        role: 'coach',
        status: 'active',
        joined_at: '2025-05-01T09:00:00Z',
        invited_at: null,
        phone: '+56 9 3375 9901',
    },
    {
        id: 'coach-trinidad-008',
        user_id: 'user-trinidad-008',
        full_name: 'Trinidad Vargas',
        email: 'trinidad@movida.cl',
        slug: 'trinidad-movida',
        specialty: 'Nutricionista Clínica',
        invite_code: 'MVTRIN',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 0,
        role: 'coach',
        status: 'invited',
        joined_at: null,
        invited_at: '2026-05-15T10:00:00Z',
        phone: '+56 9 2263 4456',
    },
    {
        id: 'coach-matias-009',
        user_id: 'user-matias-009',
        full_name: 'Matías Fuentes',
        email: 'matias@movida.cl',
        slug: 'matias-movida',
        specialty: 'Kinesiólogo | Deporte de Competición',
        invite_code: 'MVMATI',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 0,
        role: 'coach',
        status: 'invited',
        joined_at: null,
        invited_at: '2026-05-18T08:00:00Z',
        phone: '+56 9 1144 8877',
    },
    {
        id: 'coach-florencia-010',
        user_id: 'user-florencia-010',
        full_name: 'Florencia Herrera',
        email: 'florencia@movida.cl',
        slug: 'florencia-movida',
        specialty: 'Psicóloga | Bienestar Mental',
        invite_code: 'MVFLOR',
        logo_url: null,
        subscription_status: 'active',
        clients_count: 0,
        role: 'coach',
        status: 'pending',
        joined_at: null,
        invited_at: '2026-05-20T11:00:00Z',
        phone: '+56 9 0031 2255',
    },
]

export const movidaOrgMembers: OrgMember[] = movidaCoaches.map(c => ({
    id: `member-${c.id}`,
    user_id: c.user_id,
    coach_id: c.id,
    role: c.role,
    status: c.status,
    invited_at: c.invited_at,
    joined_at: c.joined_at,
    coach: {
        id: c.id,
        full_name: c.full_name,
        slug: c.slug,
        logo_url: c.logo_url,
        subscription_status: c.subscription_status,
        invite_code: c.invite_code,
    },
}))

// ─── Featured Coach (Felipe Martínez) ────────────────────────────────────────

export const felipeCoach = movidaCoaches[0]

// ─── Clients ─────────────────────────────────────────────────────────────────

const relativeDate = (daysAgo: number): string => {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString()
}

export type DemoClient = {
    id: string
    full_name: string
    email: string
    phone: string | null
    is_active: boolean
    is_archived: boolean
    coach_id: string
    org_id: string
    created_at: string
    onboarding_completed: boolean
    age: number
    condition: string
    goal: string
    city: string
    avatar_initials: string
    program_name: string | null
    last_activity: string | null
    weight_kg: number | null
    goal_weight_kg: number | null
}

export const movidaClients: DemoClient[] = [
    // Felipe's clients — detailed 5
    {
        id: 'client-maria-001',
        full_name: 'María González',
        email: 'maria.gonzalez@gmail.com',
        phone: '+56 9 8812 3344',
        is_active: true,
        is_archived: false,
        coach_id: 'coach-felipe-001',
        org_id: 'org-movida-001',
        created_at: relativeDate(90),
        onboarding_completed: true,
        age: 32,
        condition: 'Entrenamiento Funcional',
        goal: 'Mejorar fuerza y composición corporal',
        city: 'Viña del Mar',
        avatar_initials: 'MG',
        program_name: 'Hipertrofia 12 semanas',
        last_activity: relativeDate(1),
        weight_kg: 67,
        goal_weight_kg: 62,
    },
    {
        id: 'client-diego-002',
        full_name: 'Diego Ramírez',
        email: 'diego.ramirez@outlook.com',
        phone: '+56 9 7723 4455',
        is_active: true,
        is_archived: false,
        coach_id: 'coach-felipe-001',
        org_id: 'org-movida-001',
        created_at: relativeDate(7),
        onboarding_completed: false,
        age: 24,
        condition: 'Rehabilitación rodilla',
        goal: 'Recuperación post-lesión LCA',
        city: 'Valparaíso',
        avatar_initials: 'DR',
        program_name: 'Rehabilitación Rodilla 8 semanas',
        last_activity: relativeDate(2),
        weight_kg: 82,
        goal_weight_kg: 80,
    },
    {
        id: 'client-paula-003',
        full_name: 'Paula Fernández',
        email: 'paulafer@gmail.com',
        phone: '+56 9 6634 5566',
        is_active: true,
        is_archived: false,
        coach_id: 'coach-felipe-001',
        org_id: 'org-movida-001',
        created_at: relativeDate(45),
        onboarding_completed: true,
        age: 38,
        condition: 'Corrección postural',
        goal: 'Reducir dolor lumbar crónico',
        city: 'Viña del Mar (Reñaca)',
        avatar_initials: 'PF',
        program_name: 'Movilidad y Core Diario',
        last_activity: relativeDate(0),
        weight_kg: 71,
        goal_weight_kg: 68,
    },
    {
        id: 'client-carlos-004',
        full_name: 'Carlos Espinoza',
        email: 'cespinoza@empresa.cl',
        phone: '+56 9 5545 6677',
        is_active: true,
        is_archived: false,
        coach_id: 'coach-felipe-001',
        org_id: 'org-movida-001',
        created_at: relativeDate(60),
        onboarding_completed: true,
        age: 45,
        condition: 'Rendimiento deportivo',
        goal: 'Preparación para triatlón',
        city: 'Viña del Mar (Recreo)',
        avatar_initials: 'CE',
        program_name: 'Fuerza y Acondicionamiento Triatlón',
        last_activity: relativeDate(3),
        weight_kg: 78,
        goal_weight_kg: 75,
    },
    {
        id: 'client-sofia-005',
        full_name: 'Sofía Herrera',
        email: 'sofia.h@gmail.com',
        phone: '+56 9 4456 7788',
        is_active: false,
        is_archived: false,
        coach_id: 'coach-felipe-001',
        org_id: 'org-movida-001',
        created_at: relativeDate(120),
        onboarding_completed: true,
        age: 29,
        condition: 'Postparto',
        goal: 'Recuperación postparto y fortalecimiento',
        city: 'Quilpué',
        avatar_initials: 'SH',
        program_name: null,
        last_activity: relativeDate(14),
        weight_kg: 63,
        goal_weight_kg: 58,
    },
    // Additional clients (other coaches)
    ...Array.from({ length: 30 }, (_, i) => {
        const names = ['Ana López', 'Rodrigo Silva', 'Valentina Torres', 'Sebastián Morales', 'Isabela Ramos',
            'Andrés Fuentes', 'Carolina Vega', 'Nicolás Castro', 'Fernanda Díaz', 'Tomás Guzmán',
            'Mariana Reyes', 'Francisco Naranjo', 'Alejandra Pinto', 'Ignacio Carvajal', 'Renata Salinas',
            'Emilio Contreras', 'Pilar Vargas', 'Lucas Espinoza', 'Daniela Mena', 'Cristóbal Araya',
            'Javiera Soto', 'Felipe Bravo', 'Constanza Muñoz', 'Diego Vera', 'Ximena Rojas',
            'Mateo Castillo', 'Lorena Peña', 'Benjamín Flores', 'Camila Águila', 'Pablo Medina']
        const coachIds = ['coach-camila-002', 'coach-diego-003', 'coach-catalina-004', 'coach-joaquin-005', 'coach-antonia-006', 'coach-vicente-007']
        const conditions = ['Kinesiología general', 'Entrenamiento funcional', 'Rehabilitación hombro', 'Nutrición deportiva', 'Psicología deportiva', 'Corrección postural', 'Quiropraxia', 'Osteopatía']
        const programs = ['Fuerza 8 semanas', 'Movilidad y Core', 'Rehabilitación Hombro', 'Crossfit Foundations', 'Nutrición Definición', null]
        const cities = ['Viña del Mar', 'Valparaíso', 'Quilpué', 'Viña del Mar (Reñaca)', 'Viña del Mar (Recreo)']
        const name = names[i % names.length]
        const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2)
        return {
            id: `client-extra-${i + 100}`,
            full_name: name,
            email: `${name.toLowerCase().replace(/\s/g, '.').replace(/[áéíóúüñ]/g, c => ({ á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' })[c] ?? c)}@gmail.com`,
            phone: `+56 9 ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
            is_active: i % 5 !== 0,
            is_archived: false,
            coach_id: coachIds[i % coachIds.length],
            org_id: 'org-movida-001',
            created_at: relativeDate(Math.floor(Math.random() * 90) + 10),
            onboarding_completed: i % 4 !== 0,
            age: 20 + (i % 40),
            condition: conditions[i % conditions.length],
            goal: 'Mejorar salud y bienestar general',
            city: cities[i % cities.length],
            avatar_initials: initials,
            program_name: programs[i % programs.length],
            last_activity: i % 5 === 0 ? null : relativeDate(Math.floor(Math.random() * 7)),
            weight_kg: 55 + (i % 40),
            goal_weight_kg: 52 + (i % 38),
        }
    }),
]

export const movidaOrgClients: OrgClient[] = movidaClients.map(c => ({
    id: c.id,
    full_name: c.full_name,
    email: c.email,
    phone: c.phone,
    is_active: c.is_active,
    created_at: c.created_at,
    coach_id: c.coach_id,
    assignedCoach: movidaCoaches.find(co => co.id === c.coach_id)
        ? {
            id: c.coach_id,
            full_name: movidaCoaches.find(co => co.id === c.coach_id)?.full_name ?? null,
            slug: movidaCoaches.find(co => co.id === c.coach_id)?.slug ?? null,
        }
        : null,
}))

// ─── Featured Client (María González) ────────────────────────────────────────

export const mariaClient = movidaClients[0]
export const diegoClientNew = movidaClients[1]

// ─── Exercises ───────────────────────────────────────────────────────────────

export type DemoExercise = {
    id: string
    name: string
    muscle_group: string
    category: string
    description: string
    video_url: string | null
    is_custom: boolean
}

export const movidaExercises: DemoExercise[] = [
    { id: 'ex-001', name: 'Sentadilla con peso corporal', muscle_group: 'Piernas', category: 'Funcional', description: 'Sentadilla básica sin carga adicional', video_url: null, is_custom: false },
    { id: 'ex-002', name: 'Sentadilla con barra', muscle_group: 'Piernas', category: 'Fuerza', description: 'Sentadilla con barra en espalda', video_url: null, is_custom: false },
    { id: 'ex-003', name: 'Peso muerto', muscle_group: 'Espalda baja / Piernas', category: 'Fuerza', description: 'Peso muerto convencional', video_url: null, is_custom: false },
    { id: 'ex-004', name: 'Press de banca', muscle_group: 'Pecho', category: 'Fuerza', description: 'Press de banca con barra', video_url: null, is_custom: false },
    { id: 'ex-005', name: 'Dominadas', muscle_group: 'Espalda / Bíceps', category: 'Funcional', description: 'Dominadas con agarre prono', video_url: null, is_custom: false },
    { id: 'ex-006', name: 'Press militar', muscle_group: 'Hombros', category: 'Fuerza', description: 'Press de pie con barra', video_url: null, is_custom: false },
    { id: 'ex-007', name: 'Remo con barra', muscle_group: 'Espalda', category: 'Fuerza', description: 'Remo inclinado con barra', video_url: null, is_custom: false },
    { id: 'ex-008', name: 'Hip Thrust', muscle_group: 'Glúteos', category: 'Fuerza', description: 'Hip thrust con barra en banco', video_url: null, is_custom: false },
    { id: 'ex-009', name: 'Peso muerto rumano', muscle_group: 'Isquios / Glúteos', category: 'Fuerza', description: 'Peso muerto rumano con mancuernas', video_url: null, is_custom: false },
    { id: 'ex-010', name: 'Plancha', muscle_group: 'Core', category: 'Funcional', description: 'Plancha isométrica', video_url: null, is_custom: false },
    { id: 'ex-011', name: 'Curl bíceps polea', muscle_group: 'Bíceps', category: 'Aislamiento', description: 'Curl de bíceps en polea baja', video_url: null, is_custom: false },
    { id: 'ex-012', name: 'Extensión tríceps polea', muscle_group: 'Tríceps', category: 'Aislamiento', description: 'Push-down en polea alta', video_url: null, is_custom: false },
    { id: 'ex-013', name: 'Elevaciones laterales', muscle_group: 'Hombros', category: 'Aislamiento', description: 'Elevaciones laterales con mancuernas', video_url: null, is_custom: false },
    { id: 'ex-014', name: 'Thrusters', muscle_group: 'Full body', category: 'Funcional', description: 'Sentadilla + press sobre cabeza', video_url: null, is_custom: false },
    { id: 'ex-015', name: 'Burpees', muscle_group: 'Full body', category: 'Cardio', description: 'Burpee completo con salto', video_url: null, is_custom: false },
    { id: 'ex-016', name: 'Fondos en paralelas', muscle_group: 'Pecho / Tríceps', category: 'Funcional', description: 'Fondos en paralelas con peso corporal', video_url: null, is_custom: false },
    { id: 'ex-017', name: 'Clean & Jerk', muscle_group: 'Full body', category: 'Olímpico', description: 'Cargada y envión olímpico', video_url: null, is_custom: false },
    { id: 'ex-018', name: 'Snatch', muscle_group: 'Full body', category: 'Olímpico', description: 'Arranque olímpico', video_url: null, is_custom: false },
    { id: 'ex-019', name: 'Abducción cadera (máquina)', muscle_group: 'Glúteos', category: 'Rehabilitación', description: 'Abducción en máquina sentado', video_url: null, is_custom: false },
    { id: 'ex-020', name: 'Extensión rodilla (máquina)', muscle_group: 'Cuádriceps', category: 'Rehabilitación', description: 'Extensión de rodilla en máquina', video_url: null, is_custom: false },
    { id: 'ex-021', name: 'Curl femoral (máquina)', muscle_group: 'Isquios', category: 'Rehabilitación', description: 'Curl de piernas en máquina tumbado', video_url: null, is_custom: false },
    { id: 'ex-022', name: 'Sentadilla goblet', muscle_group: 'Piernas', category: 'Funcional', description: 'Sentadilla con kettlebell al pecho', video_url: null, is_custom: false },
    { id: 'ex-023', name: 'Estocada caminando', muscle_group: 'Piernas', category: 'Funcional', description: 'Estocadas en movimiento', video_url: null, is_custom: false },
    { id: 'ex-024', name: 'Clamshell', muscle_group: 'Glúteos / Cadera', category: 'Rehabilitación', description: 'Ejercicio de apertura de cadera en suelo', video_url: null, is_custom: false },
    { id: 'ex-025', name: 'Bird dog', muscle_group: 'Core / Espalda', category: 'Rehabilitación', description: 'Estabilización lumbar en cuadrupedia', video_url: null, is_custom: false },
    { id: 'ex-026', name: 'Dead bug', muscle_group: 'Core', category: 'Rehabilitación', description: 'Ejercicio core en suelo boca arriba', video_url: null, is_custom: false },
    { id: 'ex-027', name: 'Glute bridge', muscle_group: 'Glúteos', category: 'Funcional', description: 'Puente de glúteos en suelo', video_url: null, is_custom: false },
    { id: 'ex-028', name: 'Russian twist', muscle_group: 'Core', category: 'Funcional', description: 'Rotación de torso en suelo', video_url: null, is_custom: false },
    { id: 'ex-029', name: 'Face pull polea', muscle_group: 'Hombros / Espalda', category: 'Rehabilitación', description: 'Face pull con cuerda en polea alta', video_url: null, is_custom: false },
    { id: 'ex-030', name: 'Banded lateral walk', muscle_group: 'Glúteos / Cadera', category: 'Rehabilitación', description: 'Pasos laterales con banda elástica', video_url: null, is_custom: false },
]

// ─── Workout Programs ─────────────────────────────────────────────────────────

export type DemoProgram = {
    id: string
    name: string
    description: string
    weeks: number
    days_per_week: number
    level: string
    focus: string
    coach_id: string
    client_count: number
}

export const movidaPrograms: DemoProgram[] = [
    {
        id: 'prog-001',
        name: 'Hipertrofia 12 semanas',
        description: 'Programa de hipertrofia para ganar masa muscular y mejorar composición corporal.',
        weeks: 12,
        days_per_week: 4,
        level: 'Intermedio',
        focus: 'Hipertrofia',
        coach_id: 'coach-felipe-001',
        client_count: 12,
    },
    {
        id: 'prog-002',
        name: 'Rehabilitación Rodilla 8 semanas',
        description: 'Protocolo de rehabilitación post-quirúrgica LCA con enfoque funcional progresivo.',
        weeks: 8,
        days_per_week: 3,
        level: 'Todos los niveles',
        focus: 'Rehabilitación',
        coach_id: 'coach-felipe-001',
        client_count: 5,
    },
    {
        id: 'prog-003',
        name: 'Fuerza y Acondicionamiento Triatlón',
        description: 'Complemento de fuerza para atletas de triatlón en período de preparación.',
        weeks: 10,
        days_per_week: 3,
        level: 'Avanzado',
        focus: 'Fuerza',
        coach_id: 'coach-felipe-001',
        client_count: 4,
    },
    {
        id: 'prog-004',
        name: 'Movilidad y Core Diario',
        description: 'Rutina diaria de movilidad, core y corrección postural para oficinistas.',
        weeks: 6,
        days_per_week: 5,
        level: 'Principiante',
        focus: 'Movilidad',
        coach_id: 'coach-felipe-001',
        client_count: 8,
    },
    {
        id: 'prog-005',
        name: 'Postparto — Recuperación 1er Trimestre',
        description: 'Programa de recuperación suave para madres en primer trimestre postparto.',
        weeks: 12,
        days_per_week: 3,
        level: 'Principiante',
        focus: 'Rehabilitación',
        coach_id: 'coach-felipe-001',
        client_count: 3,
    },
]

// ─── Active Workout Plan (María González) ────────────────────────────────────

export type DemoWorkoutSet = {
    id: string
    exercise_id: string
    exercise_name: string
    sets: number
    reps: string
    weight_kg: number | null
    rest_seconds: number
    completed: boolean
    logged_reps: number | null
    logged_weight_kg: number | null
    previous_best: string | null
    notes: string | null
}

export type DemoWorkoutPlan = {
    id: string
    name: string
    week: number
    day: number
    program_id: string
    program_name: string
    exercises: DemoWorkoutSet[]
    completed_at: string | null
    duration_minutes: number | null
}

export const mariaActivePlan: DemoWorkoutPlan = {
    id: 'plan-maria-sem6-dia1',
    name: 'Sesión A — Tren superior',
    week: 6,
    day: 1,
    program_id: 'prog-001',
    program_name: 'Hipertrofia 12 semanas',
    completed_at: null,
    duration_minutes: null,
    exercises: [
        { id: 's-001', exercise_id: 'ex-004', exercise_name: 'Press de banca', sets: 4, reps: '8-10', weight_kg: 40, rest_seconds: 90, completed: false, logged_reps: null, logged_weight_kg: null, previous_best: '4x8 @ 37.5kg', notes: null },
        { id: 's-002', exercise_id: 'ex-007', exercise_name: 'Remo con barra', sets: 4, reps: '8-10', weight_kg: 35, rest_seconds: 90, completed: false, logged_reps: null, logged_weight_kg: null, previous_best: '4x9 @ 32.5kg', notes: null },
        { id: 's-003', exercise_id: 'ex-005', exercise_name: 'Dominadas', sets: 3, reps: '6-8', weight_kg: null, rest_seconds: 120, completed: false, logged_reps: null, logged_weight_kg: null, previous_best: '3x6 asistida', notes: 'Asistida con banda si es necesario' },
        { id: 's-004', exercise_id: 'ex-006', exercise_name: 'Press militar', sets: 3, reps: '10-12', weight_kg: 22, rest_seconds: 90, completed: false, logged_reps: null, logged_weight_kg: null, previous_best: '3x10 @ 20kg', notes: null },
        { id: 's-005', exercise_id: 'ex-013', exercise_name: 'Elevaciones laterales', sets: 3, reps: '12-15', weight_kg: 6, rest_seconds: 60, completed: false, logged_reps: null, logged_weight_kg: null, previous_best: '3x14 @ 5kg', notes: null },
        { id: 's-006', exercise_id: 'ex-011', exercise_name: 'Curl bíceps polea', sets: 3, reps: '12-15', weight_kg: 12, rest_seconds: 60, completed: false, logged_reps: null, logged_weight_kg: null, previous_best: '3x13 @ 10kg', notes: null },
    ],
}

// ─── Workout History ──────────────────────────────────────────────────────────

export type DemoWorkoutLog = {
    id: string
    plan_name: string
    week: number
    completed_at: string
    duration_minutes: number
    total_volume_kg: number
    exercises_count: number
    sets_count: number
}

export const mariaWorkoutHistory: DemoWorkoutLog[] = Array.from({ length: 24 }, (_, i) => ({
    id: `log-maria-${i + 1}`,
    plan_name: i % 2 === 0 ? 'Sesión A — Tren superior' : 'Sesión B — Tren inferior',
    week: Math.floor(i / 4) + 3,
    completed_at: relativeDate((23 - i) * 3 + 1),
    duration_minutes: 50 + (i % 3) * 10,
    total_volume_kg: 3800 + i * 120,
    exercises_count: 6,
    sets_count: 18 + (i % 3),
}))

// ─── Nutrition ────────────────────────────────────────────────────────────────

export type DemoMeal = {
    id: string
    name: string
    time: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    foods: { name: string; amount_g: number }[]
}

export const mariaDailyMeals: DemoMeal[] = [
    {
        id: 'meal-001',
        name: 'Desayuno',
        time: '07:30',
        calories: 420,
        protein_g: 28,
        carbs_g: 48,
        fat_g: 12,
        foods: [
            { name: 'Avena (cocida)', amount_g: 80 },
            { name: 'Plátano', amount_g: 100 },
            { name: 'Huevo duro', amount_g: 110 },
            { name: 'Yogurt griego', amount_g: 100 },
        ],
    },
    {
        id: 'meal-002',
        name: 'Almuerzo',
        time: '13:00',
        calories: 560,
        protein_g: 44,
        carbs_g: 62,
        fat_g: 14,
        foods: [
            { name: 'Pollo grillado', amount_g: 180 },
            { name: 'Arroz blanco', amount_g: 150 },
            { name: 'Palta', amount_g: 60 },
            { name: 'Ensalada verde', amount_g: 80 },
        ],
    },
    {
        id: 'meal-003',
        name: 'Colación tarde',
        time: '16:00',
        calories: 230,
        protein_g: 18,
        carbs_g: 28,
        fat_g: 6,
        foods: [
            { name: 'Mantequilla de maní', amount_g: 20 },
            { name: 'Marraqueta integral', amount_g: 60 },
            { name: 'Manzana', amount_g: 150 },
        ],
    },
    {
        id: 'meal-004',
        name: 'Cena',
        time: '20:00',
        calories: 490,
        protein_g: 38,
        carbs_g: 50,
        fat_g: 16,
        foods: [
            { name: 'Atún en conserva', amount_g: 160 },
            { name: 'Quínoa', amount_g: 120 },
            { name: 'Brócoli al vapor', amount_g: 150 },
            { name: 'Aceite de oliva', amount_g: 10 },
        ],
    },
]

export const mariaNutritionTotals = {
    calories: mariaDailyMeals.reduce((s, m) => s + m.calories, 0),
    protein_g: mariaDailyMeals.reduce((s, m) => s + m.protein_g, 0),
    carbs_g: mariaDailyMeals.reduce((s, m) => s + m.carbs_g, 0),
    fat_g: mariaDailyMeals.reduce((s, m) => s + m.fat_g, 0),
    target_calories: 1800,
    target_protein_g: 140,
    target_carbs_g: 200,
    target_fat_g: 60,
}

// ─── Check-ins ────────────────────────────────────────────────────────────────

export type DemoCheckIn = {
    id: string
    date: string
    weight_kg: number
    notes: string
    energy_level: number
    sleep_hours: number
    has_photo: boolean
}

export const mariaCheckIns: DemoCheckIn[] = [
    { id: 'ci-001', date: relativeDate(0), weight_kg: 67.2, notes: 'Me siento bien, energía alta. Entrené 4 días esta semana.', energy_level: 4, sleep_hours: 7.5, has_photo: true },
    { id: 'ci-002', date: relativeDate(7), weight_kg: 67.8, notes: 'Semana difícil en el trabajo, pero mantuve las sesiones.', energy_level: 3, sleep_hours: 6.5, has_photo: true },
    { id: 'ci-003', date: relativeDate(14), weight_kg: 68.1, notes: 'Noté más fuerza en press banca. Aumenté 2.5kg.', energy_level: 4, sleep_hours: 8, has_photo: false },
    { id: 'ci-004', date: relativeDate(21), weight_kg: 68.4, notes: 'Inicio del programa. Muy motivada.', energy_level: 5, sleep_hours: 7, has_photo: true },
    { id: 'ci-005', date: relativeDate(35), weight_kg: 69.0, notes: 'Peso inicial al empezar. Lista para el cambio.', energy_level: 4, sleep_hours: 7, has_photo: true },
    { id: 'ci-006', date: relativeDate(90), weight_kg: 70.2, notes: 'Primera evaluación con Felipe. Excelente atención.', energy_level: 3, sleep_hours: 6, has_photo: false },
]

// ─── Personal Records ─────────────────────────────────────────────────────────

export type DemoPR = {
    exercise_name: string
    value: string
    date: string
}

export const mariaPRs: DemoPR[] = [
    { exercise_name: 'Press de banca', value: '40 kg × 8', date: relativeDate(1) },
    { exercise_name: 'Sentadilla con barra', value: '55 kg × 6', date: relativeDate(8) },
    { exercise_name: 'Peso muerto', value: '72 kg × 5', date: relativeDate(15) },
    { exercise_name: 'Dominadas', value: '8 repeticiones', date: relativeDate(3) },
    { exercise_name: 'Hip Thrust', value: '80 kg × 12', date: relativeDate(7) },
    { exercise_name: 'Press militar', value: '25 kg × 8', date: relativeDate(4) },
]

// ─── Invoices ─────────────────────────────────────────────────────────────────

export type DemoInvoice = {
    id: string
    month: string
    amount_clp: number
    status: 'paid' | 'pending' | 'overdue'
    paid_at: string | null
    method: string
}

export const movidaInvoices: DemoInvoice[] = [
    { id: 'inv-001', month: 'Mayo 2026', amount_clp: 149990, status: 'paid', paid_at: relativeDate(21), method: 'Transferencia bancaria' },
    { id: 'inv-002', month: 'Abril 2026', amount_clp: 149990, status: 'paid', paid_at: relativeDate(51), method: 'Transferencia bancaria' },
    { id: 'inv-003', month: 'Marzo 2026', amount_clp: 149990, status: 'paid', paid_at: relativeDate(82), method: 'MercadoPago' },
    { id: 'inv-004', month: 'Febrero 2026', amount_clp: 149990, status: 'paid', paid_at: relativeDate(110), method: 'MercadoPago' },
    { id: 'inv-005', month: 'Enero 2026', amount_clp: 149990, status: 'paid', paid_at: relativeDate(141), method: 'MercadoPago' },
    { id: 'inv-006', month: 'Diciembre 2025', amount_clp: 89990, status: 'paid', paid_at: relativeDate(172), method: 'Transferencia bancaria' },
    { id: 'inv-007', month: 'Junio 2026', amount_clp: 149990, status: 'pending', paid_at: null, method: '—' },
]

// ─── Nutrition Templates ──────────────────────────────────────────────────────

export type DemoNutritionTemplate = {
    id: string
    name: string
    description: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    clients_using: number
}

export const felipeNutritionTemplates: DemoNutritionTemplate[] = [
    {
        id: 'nt-001',
        name: 'Definición — 1800 kcal',
        description: 'Plan hipocalórico moderado con alta proteína para preservar masa muscular.',
        calories: 1800,
        protein_g: 160,
        carbs_g: 180,
        fat_g: 55,
        clients_using: 8,
    },
    {
        id: 'nt-002',
        name: 'Volumen — 2600 kcal',
        description: 'Plan hipercalórico limpio orientado a ganancia de masa muscular.',
        calories: 2600,
        protein_g: 180,
        carbs_g: 310,
        fat_g: 78,
        clients_using: 6,
    },
    {
        id: 'nt-003',
        name: 'Mantenimiento — 2100 kcal',
        description: 'Plan de mantenimiento con macros equilibrados para estilo de vida activo.',
        calories: 2100,
        protein_g: 155,
        carbs_g: 240,
        fat_g: 65,
        clients_using: 10,
    },
]

// ─── Weight history for chart ─────────────────────────────────────────────────

export const mariaWeightHistory = mariaCheckIns
    .slice()
    .reverse()
    .map(ci => ({ date: ci.date, weight_kg: ci.weight_kg }))
