import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
    console.error('Error: missing Supabase URL or Service Role Key in .env.local')
    process.exit(1)
}

const adminDb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function fetchFoodsFromOpenFoodFacts(limit: number = 200) {
    console.log(`📡 Fetching ${limit} foods from Open Food Facts...`)
    
    // We search for common categories to get better results
    const categories = [
        'en:plant-based-foods', 
        'en:dairy', 
        'en:meats', 
        'en:cereals-and-potatoes',
        'en:fruits',
        'en:vegetables',
        'en:seafood',
        'en:snacks'
    ]
    const allFoods: any[] = []
    
    for (const category of categories) {
        if (allFoods.length >= limit) break
        
        const pageSize = 100
        const url = `https://world.openfoodfacts.org/category/${category}.json?page_size=${pageSize}`
        
        try {
            const response = await fetch(url)
            const data = await response.json()
            
            if (data.products) {
                const processed = data.products
                    .filter((p: any) => 
                        p.product_name && 
                        p.nutriments && 
                        p.nutriments['energy-kcal_100g'] !== undefined &&
                        p.nutriments.proteins_100g !== undefined
                    )
                    .map((p: any) => ({
                        name: p.product_name_es || p.product_name,
                        serving_size_g: 100,
                        calories: Math.round(p.nutriments['energy-kcal_100g'] || 0),
                        protein_g: Math.round(p.nutriments.proteins_100g || 0),
                        carbs_g: Math.round(p.nutriments.carbohydrates_100g || 0),
                        fats_g: Math.round(p.nutriments.fat_100g || 0),
                        coach_id: null
                    }))
                
                allFoods.push(...processed)
                console.log(`✅ Added ${processed.length} foods from category ${category}`)
            }
        } catch (error) {
            console.error(`❌ Error fetching category ${category}:`, error)
        }
    }
    
    return allFoods.slice(0, limit)
}

async function main() {
    console.log('🚀 Iniciando sembrado masivo desde API externa...')
    
    const foods = await fetchFoodsFromOpenFoodFacts(250)
    
    if (foods.length === 0) {
        console.error('❌ No se obtuvieron alimentos de la API.')
        return
    }

    console.log(`📊 Total de alimentos a insertar: ${foods.length}`)

    // Insert in chunks to avoid large request issues
    const chunkSize = 50
    for (let i = 0; i < foods.length; i += chunkSize) {
        const chunk = foods.slice(i, i + chunkSize)
        console.log(`📦 Insertando chunk ${i / chunkSize + 1}...`)
        
        const { error } = await adminDb
            .from('foods')
            .insert(chunk)

        if (error) {
            console.error(`❌ Error insertando chunk ${i / chunkSize + 1}:`, error.message)
        } else {
            console.log(`✅ Chunk ${i / chunkSize + 1} insertado con éxito.`)
        }
    }
}

main().catch(console.error)
