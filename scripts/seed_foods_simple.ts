import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const adminDb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
    console.log('🚀 Fetching foods from various categories...')
    
    const categories = ['en:cheeses', 'en:beverages', 'en:sauces', 'en:biscuits-and-cakes', 'en:yogurts']
    let totalSeeded = 0

    for (const cat of categories) {
        console.log(`📡 Fetching category: ${cat}`)
        const url = `https://world.openfoodfacts.org/category/${cat}.json?page_size=50&fields=product_name,product_name_es,nutriments`
        
        try {
            const response = await fetch(url)
            const data = await response.json()
            
            if (data.products) {
                const processed = data.products
                    .filter((p: any) => 
                        (p.product_name || p.product_name_es) && 
                        p.nutriments && 
                        p.nutriments['energy-kcal_100g'] !== undefined &&
                        p.nutriments.proteins_100g !== undefined
                    )
                    .map((p: any) => ({
                        name: (p.product_name_es || p.product_name).substring(0, 100),
                        serving_size_g: 100,
                        calories: Math.round(p.nutriments['energy-kcal_100g'] || 0),
                        protein_g: Math.round(p.nutriments.proteins_100g || 0),
                        carbs_g: Math.round(p.nutriments.carbohydrates_100g || 0),
                        fats_g: Math.round(p.nutriments.fat_100g || 0),
                        coach_id: null
                    }))

                if (processed.length > 0) {
                    const { error } = await adminDb.from('foods').insert(processed)
                    if (!error) {
                        totalSeeded += processed.length
                        console.log(`✅ Seeded ${processed.length} from ${cat}`)
                    } else {
                        console.error(`❌ Error in ${cat}:`, error.message)
                    }
                }
            }
        } catch (e) {
            console.error(`❌ Fetch error for ${cat}`)
        }
    }

    console.log(`🎉 Total seeded in this run: ${totalSeeded}`)
}

main().catch(console.error)
