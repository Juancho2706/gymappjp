import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// MOCK DATA PARA DESARROLLO (Si no hay API Key configurada)
const MOCK_RECIPES = [
    {
        id: "mock-1",
        title: "Pechuga de Pollo con Arroz y Brócoli",
        image: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?q=80&w=2069&auto=format&fit=crop",
        calories: 450,
        protein: 45,
        carbs: 40,
        fat: 10,
        prepTime: 25,
        sourceUrl: "https://example.com/recipe1",
        ingredients: [
            { text: "200g Pechuga de Pollo", food: "Pechuga de Pollo", quantity: 200, unit: "g" },
            { text: "100g Arroz Blanco", food: "Arroz Blanco", quantity: 100, unit: "g" },
            { text: "150g Brócoli", food: "Brócoli", quantity: 150, unit: "g" }
        ],
        instructions: "1. Cocina el arroz. 2. Asa el pollo a la plancha. 3. Hierve el brócoli."
    },
    {
        id: "mock-2",
        title: "Ensalada de Atún con Huevo Duro",
        image: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=2000&auto=format&fit=crop",
        calories: 320,
        protein: 35,
        carbs: 10,
        fat: 15,
        prepTime: 10,
        sourceUrl: "https://example.com/recipe2",
        ingredients: [
            { text: "1 lata de Atún", food: "Atún", quantity: 1, unit: "lata" },
            { text: "2 Huevos Duros", food: "Huevo", quantity: 2, unit: "unidad" },
            { text: "100g Lechuga", food: "Lechuga", quantity: 100, unit: "g" }
        ],
        instructions: "1. Mezcla el atún escurrido con la lechuga. 2. Corta los huevos en rodajas y añádelos."
    },
    {
        id: "mock-3",
        title: "Avena con Plátano y Almendras",
        image: "https://images.unsplash.com/photo-1517673132405-a56a62b18caf?q=80&w=2076&auto=format&fit=crop",
        calories: 380,
        protein: 12,
        carbs: 60,
        fat: 12,
        prepTime: 5,
        sourceUrl: "https://example.com/recipe3",
        ingredients: [
            { text: "50g Avena en hojuelas", food: "Avena", quantity: 50, unit: "g" },
            { text: "1 Plátano", food: "Plátano", quantity: 1, unit: "unidad" },
            { text: "15g Almendras", food: "Almendras", quantity: 15, unit: "g" }
        ],
        instructions: "1. Cocina la avena con agua o leche. 2. Añade el plátano en rodajas y las almendras."
    }
]

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (!query) {
        return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
    }

    // Aquí integraríamos Edamam o Spoonacular real si existen las variables de entorno
    const edamamAppId = process.env.EDAMAM_APP_ID
    const edamamAppKey = process.env.EDAMAM_APP_KEY

    if (edamamAppId && edamamAppKey) {
        try {
            // Ejemplo de llamada a Edamam (simplificado)
            const edamamUrl = `https://api.edamam.com/api/recipes/v2?type=public&q=${encodeURIComponent(query)}&app_id=${edamamAppId}&app_key=${edamamAppKey}`
            const response = await fetch(edamamUrl)
            const data = await response.json()
            
            // Mapear la respuesta de Edamam a nuestro formato interno
            const formattedRecipes = data.hits.map((hit: any) => {
                const r = hit.recipe
                return {
                    id: r.uri.split('_')[1] || r.uri, // Extraer ID único
                    title: r.label,
                    image: r.image,
                    calories: Math.round(r.calories / r.yield), // Calorías por porción
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
                    // Edamam no da instrucciones en la API gratuita, suele dar link al source
                    instructions: `Ver instrucciones detalladas en: ${r.url}`
                }
            })

            return NextResponse.json({ recipes: formattedRecipes })
        } catch (error) {
            console.error("Error fetching from Edamam:", error)
            return NextResponse.json({ error: 'Failed to fetch external recipes' }, { status: 500 })
        }
    }

    // FALLBACK: Retornar mock data filtrada
    console.log("No Edamam keys found, using mock data for search:", query)
    const filteredMocks = MOCK_RECIPES.filter(r => 
        r.title.toLowerCase().includes(query.toLowerCase()) || 
        r.ingredients.some(i => i.food.toLowerCase().includes(query.toLowerCase()))
    )

    // Simulamos un poco de latencia de red
    await new Promise(resolve => setTimeout(resolve, 800))

    // Si la búsqueda es muy genérica (ej: "pollo"), devolvemos mocks, sino lista vacía o todos
    const results = filteredMocks.length > 0 ? filteredMocks : MOCK_RECIPES

    return NextResponse.json({ recipes: results })
}
