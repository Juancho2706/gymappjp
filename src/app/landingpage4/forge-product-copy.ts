/**
 * Copy alineada a nuevabibliadelaapp/01-ESTADO-ACTUAL y 04-NEGOCIO-Y-ESTRATEGIA
 * (módulos reales; sin prometer features inexistentes).
 */
export type ForgeProductVisual = 'builder' | 'nutrition' | 'clients' | 'brand'

export type ForgeProductBlock = {
    id: 'rutinas' | 'nutricion' | 'alumnos' | 'marca'
    marker: string
    title: string
    aside: string
    bullets: string[]
    visual: ForgeProductVisual
    /** Leyenda bajo el mockup (UI simplificada). */
    visualCaption: string
}

export const FORGE_PRODUCT_BLOCKS: ForgeProductBlock[] = [
    {
        id: 'rutinas',
        marker: 'Módulo',
        title: 'Planes y ejecución',
        aside: 'Constructor + app alumno',
        visual: 'builder',
        visualCaption: 'Vista simplificada del constructor · no es captura en vivo',
        bullets: [
            'WeeklyPlanBuilder con drag-and-drop y edición por bloque.',
            'Variantes A/B por semana para periodizar sin duplicar programas.',
            'Biblioteca de programas con filtros, preview y duplicación con snapshot.',
            'El alumno ejecuta en la PWA con tu marca: semana, días y bloques claros.',
        ],
    },
    {
        id: 'nutricion',
        marker: 'Nutrición',
        title: 'Hub coach y adherencia alumno',
        aside: 'Tiers según plan',
        visual: 'nutrition',
        visualCaption: 'Resumen de plan y macros · datos de ejemplo',
        bullets: [
            'Nutrición coach: hub, plantillas, plan builder y tablero de planes activos.',
            'Alumno: plan activo, registro diario y adherencia a 30 días.',
            'Starter y Starter Lite no incluyen módulo de nutrición; desde Pro en adelante sí (ver /pricing).',
            'Alimentos, recetas y lógica de porciones integrada en el producto.',
        ],
    },
    {
        id: 'alumnos',
        marker: 'Clientes',
        title: 'Directorio y perfil 360°',
        aside: 'B2B2C',
        visual: 'clients',
        visualCaption: 'Directorio tipo tabla · columnas ilustrativas',
        bullets: [
            'Directorio tipo “war room”: tabla virtualizable, filtros y attention score.',
            'Perfil del alumno con pestañas: overview, análisis, nutrición, progreso, plan y facturación.',
            'Check-in en wizard con evidencia (fotos dual) para adherencia sin perder contexto.',
            'EVA cobra al coach; el alumno usa la app por relación con su coach.',
        ],
    },
    {
        id: 'marca',
        marker: 'White-label',
        title: 'Tu URL, tu marca, tu PWA',
        aside: 'CLP · LATAM',
        visual: 'brand',
        visualCaption: 'Ajustes “Mi marca” · preview estático',
        bullets: [
            'Cada coach expone su espacio en /c/[slug] con logo, colores y mensaje de bienvenida.',
            'Manifest dinámico por coach + instalación como app en el dispositivo del alumno.',
            'Precios y cobros pensados para Chile/LATAM en pesos chilenos.',
            'Propuesta: core loop constructor → asignación → ejecución alumno → seguimiento coach.',
        ],
    },
]
