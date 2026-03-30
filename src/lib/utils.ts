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
  body_part?: string | null 
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
      muscleGroup === normalizedSelectedGroup ||
      secondaryMuscles.includes(normalizedSelectedGroup);

    if (!matchesGroup) return false;

    // 2. Filtrado por término de búsqueda
    if (!normalizedSearch) return true;

    const name = normalizeString(exercise.name);
    const bodyPart = normalizeString(exercise.body_part || "");

    // Términos expandidos por el diccionario
    const searchTerms = [normalizedSearch, ...(MUSCLE_MAPPING[normalizedSearch] || [])];

    return searchTerms.some(term => 
      name.includes(term) ||
      muscleGroup.includes(term) ||
      bodyPart.includes(term) ||
      secondaryMuscles.some(sm => sm.includes(term))
    );
  });
}
