export const MUSCLE_COLORS: Record<string, string> = {
    // Pecho / Push
    'Pectorales': '#3B82F6',     // azul

    // Espalda / Pull
    'Dorsales': '#10B981',       // verde
    'Espalda Alta': '#059669',   // verde oscuro
    'Trapecios': '#34D399',      // verde claro

    // Hombros
    'Hombros': '#8B5CF6',        // violeta
    'Deltoides': '#7C3AED',      // violeta oscuro

    // Brazos
    'Bíceps': '#EF4444',         // rojo
    'Tríceps': '#DC2626',        // rojo oscuro
    'Antebrazos': '#B45309',     // marrón

    // Piernas
    'Cuádriceps': '#F59E0B',     // ámbar
    'Isquiotibiales': '#D97706', // ámbar oscuro
    'Glúteos': '#F97316',        // naranja
    'Pantorrillas': '#EA580C',   // naranja oscuro
    'Abductores': '#EAB308',     // amarillo
    'Aductores': '#CA8A04',      // amarillo oscuro

    // Core
    'Abdominales': '#06B6D4',    // cyan
    'Lumbar': '#0891B2',         // cyan oscuro
    'Oblicuos': '#0E7490',       // cyan más oscuro

    // Cardio / Otros
    'Cardio': '#EC4899',         // rosa
    'Funcional': '#6366F1',      // índigo
    'Movilidad': '#A855F7',      // purple
};

// Backward-compat aliases for old category names
const LEGACY_ALIASES: Record<string, string> = {
    'Pecho': '#3B82F6',
    'Espalda': '#10B981',
    'Piernas': '#F59E0B',
    'Brazos': '#EF4444',
    'Core': '#06B6D4',
};

export function getMuscleColor(muscleGroup: string | null | undefined): string {
    if (!muscleGroup) return '#6B7280'
    return MUSCLE_COLORS[muscleGroup] ?? LEGACY_ALIASES[muscleGroup] ?? '#6B7280'
}
