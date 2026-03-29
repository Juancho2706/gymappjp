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
    'Gemelos',
    'Core',
    'Antebrazo',
    'Trapecio',
    'Lumbar',
    'Aductores',
    'Abductores',
    'Cuerpo Completo'
] as const;

export type MuscleGroup = typeof MUSCLE_GROUPS[number];
