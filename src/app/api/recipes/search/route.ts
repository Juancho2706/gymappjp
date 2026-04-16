import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clientIpFromRequest, jsonRateLimited, rateLimitRecipesSearch } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
    const ip = clientIpFromRequest(request)
    const rl = await rateLimitRecipesSearch(ip)
    if (!rl.ok) return jsonRateLimited(rl.retryAfter)

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
    }

    // Si existen variables de entorno para Edamam, las usamos (Prioridad 1)
    const edamamAppId = process.env.EDAMAM_APP_ID
    const edamamAppKey = process.env.EDAMAM_APP_KEY

    if (edamamAppId && edamamAppKey) {
        try {
            const edamamUrl = `https://api.edamam.com/api/recipes/v2?type=public&q=${encodeURIComponent(query)}&app_id=${edamamAppId}&app_key=${edamamAppKey}`
            const response = await fetch(edamamUrl)
            const data = await response.json()
            
            const formattedRecipes = data.hits.map((hit: any) => {
                const r = hit.recipe
                return {
                    id: r.uri.split('_')[1] || r.uri,
                    title: r.label,
                    image: r.image,
                    calories: Math.round(r.calories / r.yield),
                    protein: Math.round(r.totalNutrients.PROCNT?.quantity / r.yield || 0),
                    carbs: Math.round(r.totalNutrients.CHOCDF?.quantity / r.yield || 0),
                    fat: Math.round(r.totalNutrients.FAT?.quantity / r.yield || 0),
                    prepTime: r.totalTime || 15,
                    sourceUrl: r.url,
                    ingredients: r.ingredients.map((ing: any) => ({
                        text: ing.text,
                        food: ing.food,
                        quantity: ing.quantity,
                        unit: ing.measure
                    })),
                    instructions: `Ver instrucciones detalladas en: ${r.url}`
                }
            })

            return NextResponse.json({ recipes: formattedRecipes })
        } catch (error) {
            console.error("Error fetching from Edamam:", error)
            return NextResponse.json({ error: 'Failed to fetch external recipes' }, { status: 500 })
        }
    }

    // FALLBACK: Buscar en la base de datos local recetas globales
    try {
        const supabase = await createClient()
        
        // Buscamos recetas globales que coincidan con la búsqueda (insensible a mayúsculas/acentos usando ilike)
        const { data: dbRecipes, error } = await supabase
            .from('recipes')
            .select('*, recipe_ingredients(*)')
            .is('coach_id', null)
            .ilike('name', `%${query}%`)
            .limit(20)

        if (error) throw error

        const formattedLocalRecipes = dbRecipes.map(r => ({
            id: r.id,
            title: r.name,
            image: r.image_url,
            calories: r.calories,
            protein: r.protein_g,
            carbs: r.carbs_g,
            fat: r.fats_g,
            prepTime: r.prep_time_minutes,
            sourceUrl: r.source_api_id,
            instructions: r.instructions,
            ingredients: r.recipe_ingredients.map((ing: any) => ({
                text: ing.name,
                food: ing.name,
                quantity: ing.quantity,
                unit: ing.unit
            }))
        }))

        // Si encontramos en DB, las devolvemos. Si no, array vacío.
        return NextResponse.json({ recipes: formattedLocalRecipes })

    } catch (error) {
        console.error("Error fetching local global recipes:", error)
        return NextResponse.json({ error: 'Error interno al buscar recetas' }, { status: 500 })
    }
}
