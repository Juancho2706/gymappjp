import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getRecipeDetailPageData = cache(async (recipeId: string) => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, recipe: null }

    const { data: recipe } = await supabase
        .from('recipes')
        .select(`
            *,
            recipe_ingredients (*)
        `)
        .eq('id', recipeId)
        .single()

    return { user, recipe }
})
