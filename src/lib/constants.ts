export const MUSCLE_GROUPS = [
    'Pecho',
    'Espalda',
    'Hombros',
    'Bíceps',
    'Tríceps',
    'Cuádriceps',
    'Isquios',
    'Glúteos',
    'Abductores',
    'Aductores',
    'Pantorrillas',
    'Core',
    'Trapecio',
    'Lumbar'
] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];

export const MUSCLE_MAPPING: Record<string, string[]> = {
    'pecho': ['pectoral', 'pecho', 'chest'],
    'espalda': ['dorsal', 'espalda', 'back', 'lats'],
    'hombros': ['delts', 'shoulders', 'deltoides'],
    'biceps': ['biceps'],
    'triceps': ['triceps'],
    'piernas': ['quads', 'hamstrings', 'glutes', 'calves', 'cuadriceps', 'isquios', 'glúteos', 'pantorrillas'],
    'abdomen': ['abs', 'core', 'abdomen'],
    'deltoides': ['delts', 'shoulders', 'deltoides'],
    'pectoral': ['chest', 'pectoral', 'pecho'],
    'dorsal': ['back', 'lats', 'dorsal', 'espalda'],
    'cuadriceps': ['quads', 'cuadriceps'],
    'isquios': ['hamstrings', 'isquios', 'isquiosurales'],
    'gluteos': ['glutes', 'glúteos', 'gluteo'],
    'pantorrillas': ['calves', 'pantorrillas', 'gemelos'],
    'trapecio': ['traps', 'trapecio'],
    'lumbar': ['lower back', 'lumbar'],
    'aductores': ['adductors', 'aductores'],
    'abductores': ['abductors', 'abductores'],
    'core': ['abs', 'core', 'abdomen']
};
