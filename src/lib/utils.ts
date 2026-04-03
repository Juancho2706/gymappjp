import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { MUSCLE_MAPPING } from "./constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeString(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function filterExercises<T extends { 
  name: string; 
  muscle_group: string; 
  secondary_muscles?: string[] | null; 
  body_part?: string | null;
  equipment?: string | null;
}>(
  exercises: T[],
  searchTerm: string,
  selectedMuscleGroup: string
): T[] {
  const normalizedSearch = normalizeString(searchTerm);
  const normalizedSelectedGroup = normalizeString(selectedMuscleGroup);

  return exercises.filter((exercise) => {
    // 1. Filtrado por grupo muscular (Select)
    const muscleGroup = normalizeString(exercise.muscle_group);
    const secondaryMuscles = (exercise.secondary_muscles || []).map(m => normalizeString(m));
    
    const matchesGroup = 
      normalizedSelectedGroup === "todos" || 
      normalizedSelectedGroup === "all" ||
      normalizedSelectedGroup === "todos los músculos" ||
      muscleGroup === normalizedSelectedGroup;

    if (!matchesGroup) return false;

    // 2. Filtrado por término de búsqueda
    if (!normalizedSearch) return true;

    const name = normalizeString(exercise.name);
    const bodyPart = normalizeString(exercise.body_part || "");
    const equipment = normalizeString(exercise.equipment || "");

    // Términos expandidos por el diccionario
    const searchTerms = [normalizedSearch, ...(MUSCLE_MAPPING[normalizedSearch] || [])];

    return searchTerms.some(term => 
      name.includes(term) ||
      muscleGroup.includes(term) ||
      bodyPart.includes(term) ||
      equipment.includes(term) ||
      secondaryMuscles.some(sm => sm.includes(term))
    );
  });
}

/**
 * Calcula los días restantes de un plan de entrenamiento.
 * @param startDate Fecha de inicio (string o Date)
 * @param weeksToRepeat Semanas de duración
 * @returns Número de días restantes o null si no hay datos suficientes
 */
export function calculateRemainingDays(startDate: string | Date | null, weeksToRepeat: number): number | null {
  if (!startDate || !weeksToRepeat) return null;
  
  const start = new Date(startDate);
  const totalDays = weeksToRepeat * 7;
  const endDate = new Date(start.getTime() + totalDays * 24 * 60 * 60 * 1000);
  const today = new Date();
  
  // Resetear horas para cálculo de días exactos
  endDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}
