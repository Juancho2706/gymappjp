export const MUSCLE_GROUPS = [
    'Pectoral',
    'Dorsal',
    'Deltoides Frontal',
    'Deltoides Lateral',
    'Deltoides Posterior',
    'Bíceps',
    'Tríceps',
    'Cuádriceps',
    'Isquios',
    'Glúteo',
    'Abductores',
    'Aductores',
    'Gemelos',
    'Core',
    'Antebrazo',
    'Trapecio',
    'Lumbar'
] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];

export const MUSCLE_MAPPING: Record<string, string[]> = {
    'pecho': ['pectoral', 'chest'],
    'espalda': ['dorsal', 'back', 'lats'],
    'hombros': ['delts', 'shoulders', 'deltoides'],
    'biceps': ['biceps'],
    'triceps': ['triceps'],
    'piernas': ['quads', 'hamstrings', 'glutes', 'calves', 'cuadriceps', 'isquios', 'gluteo', 'gemelos'],
    'abdomen': ['abs', 'core'],
    'deltoides': ['delts', 'shoulders', 'deltoides'],
    'pectoral': ['chest', 'pectoral'],
    'dorsal': ['back', 'lats', 'dorsal'],
    'cuadriceps': ['quads', 'cuadriceps'],
    'isquios': ['hamstrings', 'isquios'],
    'gluteo': ['glutes', 'gluteo'],
    'gemelos': ['calves', 'gemelos'],
    'trapecio': ['traps', 'trapecio'],
    'lumbar': ['lower back', 'lumbar'],
    'antebrazo': ['forearm', 'antebrazo'],
    'aductores': ['adductors', 'aductores'],
    'abductores': ['abductors', 'abductores']
};
