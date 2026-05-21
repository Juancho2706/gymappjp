'use server'

import {
    deleteRecipe as deleteRecipeImpl,
    saveRecipe as saveRecipeImpl,
} from './_actions/recipes.actions'

export async function saveRecipe(...args: Parameters<typeof saveRecipeImpl>) {
    return saveRecipeImpl(...args)
}

export async function deleteRecipe(...args: Parameters<typeof deleteRecipeImpl>) {
    return deleteRecipeImpl(...args)
}
