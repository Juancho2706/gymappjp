'use server'

import type { FoodLibraryOptions } from '../_data/nutrition-coach.queries'
import { getFoodLibrary } from '../_data/nutrition-coach.queries'

export async function searchCoachFoodLibrary(coachId: string, options: FoodLibraryOptions = {}) {
  return getFoodLibrary(coachId, options)
}
