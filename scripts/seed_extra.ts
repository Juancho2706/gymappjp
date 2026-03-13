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

const EXTRA_FOODS = [
    { name: 'Aceite de Girasol', serving_size_g: 100, calories: 884, protein_g: 0, carbs_g: 0, fats_g: 100 },
    { name: 'Arroz Rojo', serving_size_g: 100, calories: 350, protein_g: 7, carbs_g: 74, fats_g: 3 },
    { name: 'Lentejas Rojas', serving_size_g: 100, calories: 358, protein_g: 24, carbs_g: 63, fats_g: 2 },
    { name: 'Garbanzos en conserva', serving_size_g: 100, calories: 139, protein_g: 7, carbs_g: 20, fats_g: 3 },
    { name: 'Seitán', serving_size_g: 100, calories: 370, protein_g: 75, carbs_g: 14, fats_g: 2 },
    { name: 'Leche de Soja', serving_size_g: 100, calories: 54, protein_g: 3, carbs_g: 6, fats_g: 2 },
    { name: 'Yogur de Coco', serving_size_g: 100, calories: 150, protein_g: 1, carbs_g: 6, fats_g: 14 },
    { name: 'Nueces de Brasil', serving_size_g: 100, calories: 656, protein_g: 14, carbs_g: 12, fats_g: 66 },
    { name: 'Avellanas', serving_size_g: 100, calories: 628, protein_g: 15, carbs_g: 17, fats_g: 61 },
    { name: 'Pistachos', serving_size_g: 100, calories: 562, protein_g: 20, carbs_g: 28, fats_g: 45 },
    { name: 'Semillas de Calabaza', serving_size_g: 100, calories: 559, protein_g: 30, carbs_g: 11, fats_g: 49 },
    { name: 'Cacao en Polvo', serving_size_g: 100, calories: 228, protein_g: 20, carbs_g: 58, fats_g: 14 },
    { name: 'Pasta de Dátiles', serving_size_g: 100, calories: 282, protein_g: 2, carbs_g: 75, fats_g: 0 },
    { name: 'Mantequilla de Almendras', serving_size_g: 100, calories: 614, protein_g: 21, carbs_g: 19, fats_g: 55 },
    { name: 'Tahini', serving_size_g: 100, calories: 595, protein_g: 17, carbs_g: 21, fats_g: 54 },
    { name: 'Espinacas Congeladas', serving_size_g: 100, calories: 23, protein_g: 3, carbs_g: 4, fats_g: 0 },
    { name: 'Mezcla de Vegetales', serving_size_g: 100, calories: 50, protein_g: 2, carbs_g: 10, fats_g: 0 },
    { name: 'Guisantes Congelados', serving_size_g: 100, calories: 81, protein_g: 5, carbs_g: 14, fats_g: 0 },
    { name: 'Maíz Dulce en lata', serving_size_g: 100, calories: 86, protein_g: 3, carbs_g: 19, fats_g: 1 },
    { name: 'Remolacha Cocida', serving_size_g: 100, calories: 43, protein_g: 2, carbs_g: 10, fats_g: 0 }
];

async function main() {
    console.log('🚀 Agregando 20 alimentos extra para superar los 200...')
    const { error } = await adminDb.from('foods').insert(EXTRA_FOODS.map(f => ({...f, coach_id: null})))
    if (error) console.error(error.message)
    else console.log('✅ Éxito!')
}

main().catch(console.error)
